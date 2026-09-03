# 產看板的 favicon（像素風 Claude 小人）。改點陣或配色後重跑一次。
# 輸出：favicon.svg / favicon-16.png / favicon-32.png / favicon.ico / apple-touch-icon.png
from PIL import Image

# 點陣：# = 橘色像素，. = 背景（含眼睛的鏤空）
GRID = """
..####..
.######.
##.##.##
########
########
.#.##.#.
""".strip().splitlines()

FG = (217, 119, 87)      # Claude 陶土橘 #D97757
BG = (30, 31, 26)        # 深色底 #1E1F1A
COLS = len(GRID[0]); ROWS = len(GRID)

def cells():
    for r, line in enumerate(GRID):
        for c, ch in enumerate(line):
            if ch == '#':
                yield c, r

def png(size, pad_ratio=0.13, radius_ratio=0.22):
    """用大尺寸畫再縮，邊緣才乾淨。"""
    S = size * 8
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    from PIL import ImageDraw
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S-1, S-1], radius=int(S*radius_ratio), fill=BG+(255,))
    pad = S * pad_ratio
    px = (S - 2*pad) / COLS          # 一格像素的邊長（以寬為準）
    oy = (S - px*ROWS) / 2           # 垂直置中
    for c, r in cells():
        x0 = pad + c*px; y0 = oy + r*px
        d.rectangle([round(x0), round(y0), round(x0+px)-1, round(y0+px)-1], fill=FG+(255,))
    return im.resize((size, size), Image.LANCZOS)

def svg():
    pad, radius = 13.0, 22.0         # 以 100x100 viewBox 計
    px = (100 - 2*pad) / COLS
    oy = (100 - px*ROWS) / 2
    ov = 0.15   # 讓相鄰方塊重疊一點，消掉抗鋸齒接縫
    parts = []
    for r, line in enumerate(GRID):          # 同一列連續的格子併成一個 rect
        c = 0
        while c < COLS:
            if line[c] == '#':
                n = 0
                while c+n < COLS and line[c+n] == '#':
                    n += 1
                parts.append('  <rect x="%.3f" y="%.3f" width="%.3f" height="%.3f"/>'
                             % (pad+c*px, oy+r*px, px*n+ov, px+ov))
                c += n
            else:
                c += 1
    rects = '\n'.join(parts)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n'
            '  <rect width="100" height="100" rx="%.0f" fill="#%02X%02X%02X"/>\n'
            '  <g fill="#%02X%02X%02X">\n%s\n  </g>\n</svg>\n'
            % (radius, *BG, *FG, rects))

if __name__ == '__main__':
    open('favicon.svg', 'w').write(svg())
    for s in (16, 32):
        png(s).convert('RGB').save('favicon-%d.png' % s, optimize=True)
    png(180, radius_ratio=0).convert('RGB').save('apple-touch-icon.png', optimize=True)
    png(512).convert('RGB').save('/private/tmp/claude-501/-Users-guoeason-Desktop-Claude/c161af32-ed18-4fda-abf9-c4403cab8acd/scratchpad/_icon-preview.png')
    png(64).convert('RGB').save('favicon.ico', sizes=[(16,16),(32,32),(48,48)])
    print('ok:', COLS, 'x', ROWS, 'grid')
