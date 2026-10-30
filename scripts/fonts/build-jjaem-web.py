#!/usr/bin/env python3
"""쨈 폰트 웹 조각 만들기 (첫 화면 글꼴 용량 줄이기용)

하는 일
  1) 로고(48px 이상 제목)용: 쨈 제목 컬러·입체·평면을 로고에 실제로 쓰는 글자만 남겨
     'JJAEM Hero Color' / 'JJAEM Hero' / 'JJAEM Hero Flat' 으로 따로 만들어요.
     컬러판의 COLR·CPAL 표는 그대로 남기고, 남았는지 직접 확인해요.
  2) 쨈 본문 Regular·Bold와 쨈 제목 평면: Google Fonts 한국어 글꼴과 같은 방식으로
     한글을 쓰임 빈도에 따라 약 100조각(unicode-range)으로 나눠요.
     나눔 표는 scripts/fonts/noto-kr-slices.json 이에요.
  3) 위 조각을 부르는 src/assets/fonts/jjaem/jjaem-web.css 를 만들어요.

원본 묶음(쨈폰트_v1.0.5)은 읽기만 하고 고치지 않아요.

쓰는 법 (fonttools 4.x, brotli 필요: pip install fonttools brotli)
  python3 scripts/fonts/build-jjaem-web.py --src /workspace/font/release/쨈폰트_v1.0.5

로고 글자를 바꾸거나 48px 이상 제목(--font-hero)을 새로 쓰면 HERO_TEXT 에 글자를 더하고 다시 돌려 주세요.
"""
import argparse, json, os, shutil, sys, tempfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src/assets/fonts/jjaem'
SLICES = Path(__file__).with_name('noto-kr-slices.json')

# 48px 이상 제목(--font-hero)에 실제로 나오는 글자: src/app-shell.html 의 로고 h1 "SAMBONG FC"
HERO_TEXT = 'SAMBONG FC'

HERO = [  # (원본 한파일판, css 이름, 파일 이름 앞부분)
    ('JJAEM-TitleColor-Regular.woff2', 'JJAEM Hero Color', 'hero-color'),
    ('JJAEM-Title-Regular.woff2', 'JJAEM Hero', 'hero'),
    ('JJAEM-TitleFlat-Regular.woff2', 'JJAEM Hero Flat', 'hero-flat'),
]
SLICED = [  # (원본 한파일판, css 이름, 굵기, 파일 이름 앞부분)
    ('JJAEMBody-Regular.woff2', 'JJAEM Body', 400, 'body-400'),
    ('JJAEMBody-Bold.woff2', 'JJAEM Body', 700, 'body-700'),
    ('JJAEM-TitleFlat-Regular.woff2', 'JJAEM Title Flat', 400, 'title-flat'),
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
    (fonts_dir / 'hero').mkdir(parents=True)
    (fonts_dir / 'slices').mkdir(parents=True)

    # 원본은 그대로 두고, 임시 폴더에 TTF로 풀어 둬요(조각을 빨리 만들려고)
    tmp = Path(tempfile.mkdtemp(prefix='jjaem-'))
    plain = {}
    for fn in {h[0] for h in HERO} | {s[0] for s in SLICED}:
        f = TTFont(one / fn, recalcTimestamp=False)
        f.flavor = None
        plain[fn] = tmp / (fn[:-6] + '.ttf')
        f.save(plain[fn])
    cmaps = {fn: set(TTFont(p, lazy=True).getBestCmap()) for fn, p in plain.items()}

    jobs, css_hero, css_slices = [], [], {}
    hero_cps = {ord(c) for c in HERO_TEXT}
    for fn, family, stem in HERO:
        miss = hero_cps - cmaps[fn]
        if miss:
            sys.exit('%s 에 없는 로고 글자가 있어요: %r' % (fn, ''.join(map(chr, miss))))
        dst = fonts_dir / 'hero' / (stem + '.woff2')
        jobs.append((str(plain[fn]), hero_cps, str(dst), family))
        css_hero.append(face(family, 400, 'fonts/hero/%s.woff2' % stem, hero_cps))

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

    # 컬러 로고에 COLR·CPAL 이 남았는지 확인
    color = TTFont(fonts_dir / 'hero' / 'hero-color.woff2')
    if 'COLR' not in color or 'CPAL' not in color:
        sys.exit('컬러 로고 조각에서 COLR/CPAL 표가 빠졌어요')
    print('컬러 로고: COLR v%d, 색 %d개, 칠한 글자 %d개' % (
        color['COLR'].version, len(color['CPAL'].palettes[0]),
        color['COLR'].table.BaseGlyphList.BaseGlyphCount if color['COLR'].version == 1 else len(color['COLR'].ColorLayers)))

    head = ('/* 쨈 폰트 v1.0.5 웹 조각 — scripts/fonts/build-jjaem-web.py 로 만든 파일이에요. 손으로 고치지 마세요.\n'
            '   로고(JJAEM Hero*)는 "%s" 글자만, 본문·평면은 한글 쓰임 빈도별 조각(unicode-range)이에요.\n'
            '   같은 조각의 굵기별 선언을 붙여 두어 gzip이 잘 줄어들게 했어요. */\n' % HERO_TEXT)
    body = '\n'.join(css_hero)
    for name in order:
        if name in css_slices:
            body += '\n' + '\n'.join(css_slices[name])
    (OUT / 'jjaem-web.css').write_text(head + body + '\n', encoding='utf-8')

    total = sum(sz for _, sz in results)
    print('조각 %d개, 합계 %s바이트, CSS %s바이트' % (len(results), format(total, ','), format((OUT / 'jjaem-web.css').stat().st_size, ',')))
    for d, sz in results[:3]:
        print('  %s %s' % (os.path.relpath(d, ROOT), format(sz, ',')))


if __name__ == '__main__':
    main()
