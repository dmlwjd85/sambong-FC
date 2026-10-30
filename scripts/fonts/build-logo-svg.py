#!/usr/bin/env python3
"""첫 화면 로고 'SAMBONG FC'를 쨈 제목 컬러(COLRv1) 글꼴로 그려 SVG로 만들어요.

아이폰 사파리처럼 COLRv1 컬러 글꼴을 못 그리는 브라우저에서도 크롬과 똑같은
빨간 입체 로고가 보이게 하려고, 글꼴 대신 벡터 그림을 써요.
그리는 도구는 fontTools 개발자들이 만든 blackrenderer(COLRv1 → SVG)예요.

  python3 -m venv br-venv && br-venv/bin/pip install blackrenderer
  br-venv/bin/python scripts/fonts/build-logo-svg.py [--src 쨈폰트_v1.0.5 폴더]

크기는 지금 화면과 같게 맞춰요: 글자 48px, 글자 사이 1px(letter-spacing),
높이는 글꼴의 줄 상자(ascent+descent = 1.25em)예요.
"""
import argparse, os, re
import uharfbuzz as hb
from blackrenderer.font import BlackRendererFont
from blackrenderer.backends.svg import SVGSurface, SVGCanvas, SVGPath, RGBAPaint
from fontTools.ttLib.tables.otTables import CompositeMode
from contextlib import contextmanager
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Identity
import pathops


class _Path(SVGPath):
    """SVG 경로 글자와 함께 그린 순서도 기억해요(클립을 겹칠 때 써요)."""
    def __init__(self, glyphSet=None):
        super().__init__(glyphSet)
        self.rec = RecordingPen()
    def _moveTo(self, pt): super()._moveTo(pt); self.rec.moveTo(pt)
    def _lineTo(self, pt): super()._lineTo(pt); self.rec.lineTo(pt)
    def _curveToOne(self, a, b, c): super()._curveToOne(a, b, c); self.rec.curveTo(a, b, c)
    def _qCurveToOne(self, a, b): super()._qCurveToOne(a, b); self.rec.qCurveTo(a, b)
    def _closePath(self): super()._closePath(); self.rec.closePath()


class _Canvas(SVGCanvas):
    """blackrenderer SVG 캔버스에서 빠진 두 가지를 채워요.
    1) 겹친 클립: 원래는 마지막 클립만 써요(소스의 FIXME). skia-pathops로 진짜 교집합을 만들어요.
    2) 합성 DEST_OUT: SVG 캔버스는 합성 방식을 무시해서, 빼야 할 남색 모양이 위에 덮여 그려져요.
       이 글꼴의 DEST_OUT 원본은 모두 불투명 단색이라, '뒤 그림 − 원본 모양'을 벡터 빼기로 정확히 만들 수 있어요."""
    def _setup(self):
        self._clipOps = None
        self._abs = []          # self.elements와 같은 순서로, 실제로 칠해지는 모양(화면 좌표)
        self._comp = []         # 합성 단계 기록
        self._pending = None

    @staticmethod
    def newPath():
        return _Path()

    @contextmanager
    def savedState(self):
        prev = self._clipOps
        with SVGCanvas.savedState(self):
            yield
        self._clipOps = prev

    def _toOps(self, rec, transform):
        out = pathops.Path()
        rec.replay(TransformPen(out.getPen(), transform))
        return out

    def clipPath(self, path):
        cur = self._toOps(path.rec, self.currentTransform)
        if self._clipOps is not None:
            cur = pathops.op(self._clipOps, cur, pathops.PathOp.INTERSECTION)
        self._clipOps = cur
        # 화면 좌표로 바꾼 교집합 하나만 남겨요(변환은 단위 행렬)
        self.clipStack = ((_svg(cur), Identity),)

    def _canDrawPath(self, path):
        self._pending = path
        return SVGCanvas._canDrawPath(self, path)

    def _addElement(self, fillPath, fillTransform, paint, gradientTransform):
        SVGCanvas._addElement(self, fillPath, fillTransform, paint, gradientTransform)
        shape = self._toOps(self._pending.rec, fillTransform)
        if self._clipOps is not None:
            shape = pathops.op(shape, self._clipOps, pathops.PathOp.INTERSECTION)
        self._abs.append(shape)

    @contextmanager
    def compositeMode(self, mode):
        if mode == CompositeMode.SRC_OVER:
            self._comp.append([len(self.elements), None])
            yield
            self._comp.pop()
            return
        if mode != CompositeMode.DEST_OUT:
            raise NotImplementedError(f'합성 방식 {mode.name}은 아직 못 그려요')
        frame = self._comp[-1]
        frame[1] = len(self.elements)
        yield
        start, split = frame
        for el in self.elements[split:]:
            paint = el[4]
            if not (isinstance(paint, RGBAPaint) and paint[3] >= 1):
                raise NotImplementedError('DEST_OUT 원본이 불투명 단색이 아니에요')
        src = pathops.Path()
        for shp in self._abs[split:]:
            src = pathops.op(src, shp, pathops.PathOp.UNION)
        del self.elements[split:], self._abs[split:]
        for i in range(start, split):
            fillPath, fillT, _c, _ct, paint, gradT = self.elements[i]
            left = pathops.op(self._abs[i], src, pathops.PathOp.DIFFERENCE)
            self._abs[i] = left
            self.elements[i] = (fillPath, fillT, _svg(left), fillT.inverse(), paint, gradT)
        # 다 지워진 조각은 빼요
        keep = [k for k in range(len(self.elements)) if k < start or k >= split or _svg(self._abs[k])]
        self.elements[:] = [self.elements[k] for k in keep]
        self._abs[:] = [self._abs[k] for k in keep]


def _svg(ops):
    out = SVGPath()
    ops.draw(out)
    return out.svgPath()


class _Surface(SVGSurface):
    def canvas(self, boundingBox):
        from contextlib import contextmanager
        @contextmanager
        def cm():
            with SVGSurface.canvas(self, boundingBox) as c:
                c.__class__ = _Canvas
                c._setup()
                yield c
        return cm()

TEXT = 'SAMBONG FC'
FONT_PX = 48          # text-5xl
TRACK_PX = 1          # letter-spacing: 1px
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'src', 'assets', 'logo', 'sambong-fc-logo.svg')

ap = argparse.ArgumentParser()
ap.add_argument('--src', default='/workspace/font/release/쨈폰트_v1.0.5')
ap.add_argument('--out', default=OUT)
a = ap.parse_args()
font_path = os.path.join(a.src, '설치용', '쨈제목컬러', '전체판', 'JJAEM-TitleColor-Regular.ttf')

font = BlackRendererFont(font_path)
upm = font.unitsPerEm
hhea = font.ttFont['hhea']
asc, desc = hhea.ascent, -hhea.descent
track = TRACK_PX * upm / FONT_PX

buf = hb.Buffer(); buf.add_str(TEXT); buf.guess_segment_properties()
hb.shape(font.hbFont, buf, None)
glyphs = [(font.glyphNames[i.codepoint], p.x_advance, p.x_offset, p.y_offset)
          for i, p in zip(buf.glyph_infos, buf.glyph_positions)]
width = sum(adv + track for _, adv, _, _ in glyphs)

surface = SVGSurface() if os.environ.get("LOGO_NOPATCH") else _Surface()
with surface.canvas((0, -desc, round(width), asc)) as canvas:
    palette = font.getPalette(0)
    for name, adv, dx, dy in glyphs:
        with canvas.savedState():
            canvas.translate(dx, dy)
            font.drawGlyph(name, canvas, palette=palette)
        canvas.translate(adv + track, 0)
tmp = a.out + '.tmp'
os.makedirs(os.path.dirname(a.out), exist_ok=True)
surface.saveImage(tmp)
svg = open(tmp, encoding='utf-8').read(); os.remove(tmp)
# 크기는 CSS가 정해요(width/height 속성은 빼고 viewBox만 남겨요)
svg = re.sub(r'<svg([^>]*?) width="[^"]*" height="[^"]*"', r'<svg\1', svg, count=1)
svg = re.sub(r'<\?xml[^>]*\?>\s*', '', svg)
svg = svg.replace(' preserveAspectRatio="xMinYMin slice"', '').replace(' version="1.1"', '')
# 화면 읽기 프로그램은 옆의 숨은 글자 'SAMBONG FC'를 읽어요. 그림은 건너뛰게 해요
svg = svg.replace('<svg ', '<svg class="sambong-logo" aria-hidden="true" focusable="false" ', 1)
# 문서 안에 바로 넣으니 id가 겹치지 않게 앞에 sfl- 를 붙여요
svg = re.sub(r'\b(gradient|clip)_(\d+)', r'sfl-\1\2', svg)
svg = '<!-- 글꼴: 쨈 제목 컬러 — © 2026 쨈 폰트 팀 (scripts/fonts/build-logo-svg.py로 만듦) -->\n' + svg
open(a.out, 'w', encoding='utf-8').write(svg)
print(f'{a.out}: {len(svg.encode())}B, viewBox 0 {-desc} {round(width)} {asc+desc}, '
      f'화면 크기 {width*FONT_PX/upm:.2f}×{(asc+desc)*FONT_PX/upm:.2f}px')
