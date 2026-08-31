# 產 LINE／FB 連結預覽用的 1200x630 卡片圖。改標題文案後重跑一次。
from PIL import Image, ImageDraw, ImageFont
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
im.save('og-board.png',optimize=True)
print('og-board.png', im.size)
