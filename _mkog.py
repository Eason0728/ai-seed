# 產 LINE／FB 連結預覽用的 1200x630 卡片圖。改標題文案後重跑一次。
from PIL import Image, ImageDraw, ImageFont
from _mkicon import GRID, FG, COLS, ROWS   # 像素小人的點陣與橘色，與 favicon 同一份
F='/Users/guoeason/Library/Fonts/NotoSansCJKtc-%s.otf'
BG=(18,19,15); INK=(237,237,232); INK2=(188,188,180); INK3=(139,139,131); ACC=(111,190,150)
W,H=1200,630
im=Image.new('RGB',(W,H),BG); d=ImageDraw.Draw(im)
# 左側細直條當視覺錨點
d.rectangle([0,0,10,H],fill=ACC)

# 三個品牌方塊
x=88; y=78; S=104
for name in ('tile_mzt','tile_mala','tile_yiwu'):
    t=Image.open('assets/%s.png'%name).convert('RGBA').resize((S,S),Image.LANCZOS)
    m=Image.new('L',(S,S),0); ImageDraw.Draw(m).rounded_rectangle([0,0,S-1,S-1],radius=20,fill=255)
    im.paste(t,(x,y),m); x+=S+22

f_kick=ImageFont.truetype(F%'Medium',30)
f_big =ImageFont.truetype(F%'Black',108)
f_sub =ImageFont.truetype(F%'Regular',33)
f_ft  =ImageFont.truetype(F%'Medium',27)

d.text((88,246),'鼎兆元集團 · AI 種子計劃',font=f_kick,fill=INK3)
d.text((88,300),'學員看板',font=f_big,fill=INK)
d.text((88,468),'四堂課進度 · 每個人每月省下多少分鐘',font=f_sub,fill=INK2)
d.line([88,548,1112,548],fill=(58,60,52),width=2)
d.text((88,570),'填自己那一張要先登入',font=f_ft,fill=INK3)
# 右側：像素小人（與 favicon 同一個點陣，不畫底，直接浮在深色卡上）
PX=38; MARGIN=88          # 右邊距與左側文字的 x=88 對稱
ox = W - MARGIN - PX*COLS
oy = 330 - PX*ROWS//2     # 中心略高於文字塊中心，視覺較穩
for r,line in enumerate(GRID):
    c=0
    while c < COLS:
        if line[c]=='#':
            n=0
            while c+n < COLS and line[c+n]=='#': n+=1
            d.rectangle([ox+c*PX, oy+r*PX, ox+(c+n)*PX-1, oy+(r+1)*PX-1], fill=FG)
            c+=n
        else:
            c+=1

im.save('og-board.png',optimize=True)
print('og-board.png', im.size)

# 產完圖順手把 index.html 的 og:image 版本戳換掉，LINE／FB 重抓時才不會拿到 CDN 的舊圖。
# 參數名固定用 t 不能用 v——實測 ?v= 會讓 og:title 整個消失（平台把 v 當版本參數）。
import re, time
_st = time.strftime('%Y%m%d%H%M')
_h = open('index.html').read()
_h2 = re.sub(r'(og-board\.png)(\?t=\d+)?"', r'\1?t=%s"' % _st, _h)
open('index.html','w').write(_h2)
print('og:image 版本戳 →', _st)
