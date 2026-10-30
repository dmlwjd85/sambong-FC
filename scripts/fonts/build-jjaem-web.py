#!/usr/bin/env python3
"""쨈 폰트 웹 조각 만들기 (첫 화면 글꼴 용량 줄이기용)

하는 일
  1) 쨈 본문 Regular·Bold: Google Fonts 한국어 글꼴과 같은 방식으로
     한글을 쓰임 빈도에 따라 약 100조각(unicode-range)으로 나눠요.
     나눔 표는 scripts/fonts/noto-kr-slices.json 이에요.
     이모지로 쓰이는 글자(⚽ ❤ ☀ 등)는 조각에서 빼서, 기기의 컬러 이모지로 보이게 해요.
  2) 위 조각을 부르는 src/assets/fonts/jjaem/jjaem-web.css 를 만들어요.

첫 화면 로고는 글꼴이 아니라 SVG 그림이에요(scripts/fonts/build-logo-svg.py).
제목도 본문 Bold를 써서, 쨈 제목 글꼴은 웹에 싣지 않아요.

원본 묶음(쨈폰트_v1.0.5)은 읽기만 하고 고치지 않아요.

쓰는 법 (fonttools 4.x, brotli 필요: pip install fonttools brotli)
  python3 scripts/fonts/build-jjaem-web.py --src /workspace/font/release/쨈폰트_v1.0.5
"""
import argparse, json, os, shutil, sys, tempfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src/assets/fonts/jjaem'
SLICES = Path(__file__).with_name('noto-kr-slices.json')

# 조각에서 뺄 이모지 글자: Unicode 16.0 emoji-data.txt 의 Emoji·Emoji_Component 전부
# (U+0100 미만의 # * 0-9 © ® 와 ™ 는 글자처럼 쓰니 남겨요) + ZWJ·VS16·키캡.
# 쨈 본문에 ⚽ ❤ 🅰 같은 글자가 들어 있어서, 빼지 않으면 컬러 이모지 대신 단색 글자로 나와요.
EMOJI_RANGES = """
200D 203C 2049 20E3 2139 2194-2199 21A9-21AA 231A-231B 2328 23CF 23E9-23F3 23F8-23FA
24C2 25AA-25AB 25B6 25C0 25FB-25FE 2600-2604 260E 2611 2614-2615 2618 261D 2620
2622-2623 2626 262A 262E-262F 2638-263A 2640 2642 2648-2653 265F-2660 2663 2665-2666
2668 267B 267E-267F 2692-2697 2699 269B-269C 26A0-26A1 26A7 26AA-26AB 26B0-26B1
26BD-26BE 26C4-26C5 26C8 26CE-26CF 26D1 26D3-26D4 26E9-26EA 26F0-26F5 26F7-26FA 26FD
2702 2705 2708-270D 270F 2712 2714 2716 271D 2721 2728 2733-2734 2744 2747 274C 274E
2753-2755 2757 2763-2764 2795-2797 27A1 27B0 27BF 2934-2935 2B05-2B07 2B1B-2B1C 2B50
2B55 3030 303D 3297 3299 FE0F 1F004 1F0CF 1F170-1F171 1F17E-1F17F 1F18E 1F191-1F19A
1F1E6-1F1FF 1F201-1F202 1F21A 1F22F 1F232-1F23A 1F250-1F251 1F300-1F321 1F324-1F393
1F396-1F397 1F399-1F39B 1F39E-1F3F0 1F3F3-1F3F5 1F3F7-1F4FD 1F4FF-1F53D 1F549-1F54E
1F550-1F567 1F56F-1F570 1F573-1F57A 1F587 1F58A-1F58D 1F590 1F595-1F596 1F5A4-1F5A5
1F5A8 1F5B1-1F5B2 1F5BC 1F5C2-1F5C4 1F5D1-1F5D3 1F5DC-1F5DE 1F5E1 1F5E3 1F5E8 1F5EF
1F5F3 1F5FA-1F64F 1F680-1F6C5 1F6CB-1F6D2 1F6D5-1F6D7 1F6DC-1F6E5 1F6E9 1F6EB-1F6EC
1F6F0 1F6F3-1F6FC 1F7E0-1F7EB 1F7F0 1F90C-1F93A 1F93C-1F945 1F947-1F9FF 1FA70-1FA7C
1FA80-1FA89 1FA8F-1FAC6 1FACE-1FADC 1FADF-1FAE9 1FAF0-1FAF8 E0020-E007F
"""
SLICED = [  # (원본 한파일판, css 이름, 굵기, 파일 이름 앞부분)
    ('JJAEMBody-Regular.woff2', 'JJAEM Body', 400, 'body-400'),
    ('JJAEMBody-Bold.woff2', 'JJAEM Body', 700, 'body-700'),
]


def parse_range(s):
    cps = set()
    for part in s.split(','):
        part = part.strip()
        if not part:
            continue
        part = part[2:]
        if '-' in part:
            a, b = part.split('-')
            cps.update(range(int(a, 16), int(b, 16) + 1))
        else:
            cps.add(int(part, 16))
    return cps


def to_range(cps):
    cps = sorted(cps)
    out, i = [], 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        out.append('U+%x' % cps[i] if i == j else 'U+%x-%x' % (cps[i], cps[j]))
        i = j + 1
    return ', '.join(out)


def emoji_cps():
    cps = set()
    for part in EMOJI_RANGES.split():
        a, _, b = part.partition('-')
        cps.update(range(int(a, 16), int(b or a, 16) + 1))
    return cps


def options():
    o = subset.Options()
    o.flavor = 'woff2'
    o.layout_features = ['*']
    o.name_IDs = ['*']          # 저작권·라이선스 표기(이름 표)를 모두 남겨요
    o.name_languages = ['*']
    o.name_legacy = True
    o.notdef_outline = True
    o.drop_tables = [t for t in o.drop_tables if t not in ('COLR', 'CPAL')]
    return o


def do_subset(job):
    src, cps, dst, rename = job
    font = TTFont(src, recalcTimestamp=False)  # 다시 돌려도 같은 파일이 나오게
    s = subset.Subsetter(options())
    s.populate(unicodes=sorted(cps))
    s.subset(font)
    if rename:
        name = font['name']
        for rec in list(name.names):
            if rec.nameID in (1, 16):
                name.setName(rename, rec.nameID, rec.platformID, rec.platEncID, rec.langID)
            elif rec.nameID in (4,):
                name.setName(rename, rec.nameID, rec.platformID, rec.platEncID, rec.langID)
            elif rec.nameID in (3, 6):
                name.setName(rename.replace(' ', '') + '-Regular', rec.nameID, rec.platformID, rec.platEncID, rec.langID)
    font.flavor = 'woff2'
    font.save(dst)
    return dst, os.path.getsize(dst)


def face(family, weight, url, cps):
    return ("@font-face{font-family:'%s';font-style:normal;font-weight:%d;font-display:swap;"
            "src:url('%s') format('woff2');unicode-range:%s;}" % (family, weight, url, to_range(cps)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='/workspace/font/release/쨈폰트_v1.0.5')
    ap.add_argument('--jobs', type=int, default=os.cpu_count() or 4)
    a = ap.parse_args()
    one = Path(a.src) / '웹용/한파일판'
    if not one.is_dir():
        sys.exit('원본 묶음의 웹용/한파일판 폴더를 찾지 못했어요: %s' % one)

    fonts_dir = OUT / 'fonts'
    if fonts_dir.exists():
        shutil.rmtree(fonts_dir)
    (fonts_dir / 'slices').mkdir(parents=True)

    # 원본은 그대로 두고, 임시 폴더에 TTF로 풀어 둬요(조각을 빨리 만들려고)
    tmp = Path(tempfile.mkdtemp(prefix='jjaem-'))
    plain = {}
    for fn in {s[0] for s in SLICED}:
        f = TTFont(one / fn, recalcTimestamp=False)
        f.flavor = None
        plain[fn] = tmp / (fn[:-6] + '.ttf')
        f.save(plain[fn])
    emoji = emoji_cps()
    cmaps = {fn: set(TTFont(p, lazy=True).getBestCmap()) - emoji for fn, p in plain.items()}

    jobs, css_slices = [], {}

    slices = json.loads(SLICES.read_text(encoding='utf-8'))['slices']
    order = [s['name'] for s in slices] + ['rest%02d' % i for i in range(100)]
    for fn, family, weight, stem in SLICED:
        cmap, used = cmaps[fn], set()
        groups = []
        for s in slices:
            cps = parse_range(s['unicodeRange']) & cmap - used
            used |= cps
            if cps:
                groups.append((s['name'], cps))
        # 나눔 표에 없는 글자(옛한글 자모, 기호 일부)는 100자씩 끊어 'rest00…' 조각으로 둬요.
        # 한 덩어리로 두면 ✓·⚠ 같은 기호 하나 때문에 큰 파일을 통째로 받게 돼요.
        rest = sorted(cmap - used)
        for i in range(0, len(rest), 100):
            groups.append(('rest%02d' % (i // 100), set(rest[i:i + 100])))
        for name, cps in groups:
            rel = 'fonts/slices/%s.%s.woff2' % (stem, name)
            jobs.append((str(plain[fn]), cps, str(OUT / rel), None))
            css_slices.setdefault(name, []).append(face(family, weight, rel, cps))

    with ProcessPoolExecutor(a.jobs) as ex:
        results = list(ex.map(do_subset, jobs, chunksize=4))
    shutil.rmtree(tmp)

    head = ('/* 쨈 폰트 v1.0.5 웹 조각 — scripts/fonts/build-jjaem-web.py 로 만든 파일이에요. 손으로 고치지 마세요.\n'
            '   본문 Regular·Bold는 한글 쓰임 빈도별 조각(unicode-range)이에요. 이모지 글자는 빼서 기기 컬러 이모지로 보여요.\n'
            '   같은 조각의 굵기별 선언을 붙여 두어 gzip이 잘 줄어들게 했어요. */\n')
    body = '\n'.join('\n'.join(css_slices[name]) for name in order if name in css_slices)
    (OUT / 'jjaem-web.css').write_text(head + body + '\n', encoding='utf-8')

    total = sum(sz for _, sz in results)
    print('조각 %d개, 합계 %s바이트, CSS %s바이트' % (len(results), format(total, ','), format((OUT / 'jjaem-web.css').stat().st_size, ',')))
    for d, sz in results[:3]:
        print('  %s %s' % (os.path.relpath(d, ROOT), format(sz, ',')))


if __name__ == '__main__':
    main()
