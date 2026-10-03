# Убирает фон с исходных спрайтов орка и приводит три ракурса к одному размеру.
# Запуск: python3 tools/clean-orc.py  (нужны pillow, numpy, scipy)
# Вход: сырые картинки assets/source/raw; выход: assets/source/orc_{front,side,back}.png (1600×1600, RGBA),
# фигура везде одной высоты, ноги на одной линии, по центру.
import os
import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = os.path.join(os.path.dirname(__file__), '..')
RAW = {
    'front': 'assets/source/raw/orc_front_raw.png',                     # уже прозрачный
    'side': 'assets/source/raw/orc_side_raw.jpg',   # «нарисованная» шахматка (чёрный/серый)
    'back': 'assets/source/raw/orc_back_raw.jpg',   # чёрный фон
}
OUT = 1600            # размер холста
FIG_H = 1330          # высота фигуры на холсте
FOOT = 1470           # линия ног
OUTLINE = 7           # толщина контура в пикселях исходника 1024
CLOSE = 18            # радиус «склейки» кусков фигуры, разрезанных контурами

def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r

def figure_mask(rgb, bg):
    """bg — булева карта «похоже на фон». Фигура = всё, что не соединено с краем через фон,
    плюс чёрный контур вокруг неё."""
    dark = rgb.max(2) < 70
    lab, _ = nd.label(bg)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    outside = np.isin(lab, edge[edge > 0])
    core = ~outside                                           # всё, до чего фон не дотянулся
    core = nd.binary_opening(core, disk(2))                   # мусор JPEG
    lab, n = nd.label(core)                                   # оставляем крупные куски
    sizes = nd.sum(core, lab, range(1, n + 1))
    core = np.isin(lab, 1 + np.nonzero(sizes > 400)[0])
    solid = nd.binary_fill_holes(nd.binary_closing(core, disk(CLOSE)))
    solid = nd.binary_fill_holes(solid | core)
    rim = nd.binary_dilation(solid, disk(OUTLINE)) & dark     # тёмный контур снаружи
    return solid | rim

def clean(view):
    im = Image.open(os.path.join(ROOT, RAW[view])).convert('RGBA')
    a = np.array(im)
    if view == 'front':
        alpha = a[:, :, 3]
    else:
        rgb = a[:, :, :3].astype(int)
        h, w = rgb.shape[:2]
        neutral = (rgb.max(2) - rgb.min(2)) < 22
        v = rgb.mean(2)
        if view == 'side':
            sq = 1024 / 50
            yy, xx = np.mgrid[0:h, 0:w]
            black_sq = ((np.floor(xx / sq) + np.floor(yy / sq)) % 2) == 0
            # на стыках клеток JPEG смазывает цвет — там принимаем любой из двух
            near = (np.abs(xx / sq - np.round(xx / sq)) * sq < 3) | (np.abs(yy / sq - np.round(yy / sq)) * sq < 3)
            is_black, is_gray = v < 45, (v > 120) & (v < 205)
            bg = neutral & ((black_sq & is_black) | (~black_sq & is_gray) | (near & (is_black | is_gray | ((v >= 45) & (v <= 120)))))
            lab, _ = nd.label(nd.binary_opening(bg, disk(6)))
            edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
            m = nd.binary_fill_holes(~np.isin(lab, edge[edge > 0]))
            m = nd.binary_opening(m, disk(3))
        else:
            # Чёрный фон того же цвета, что и контур. Размыкание (opening) убирает из «фона» все узкие
            # чёрные линии (контур, прорисовка), поэтому заливка снаружи не протекает внутрь фигуры.
            lab, _ = nd.label(nd.binary_opening(v < 35, disk(6)))
            edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
            m = nd.binary_fill_holes(~np.isin(lab, edge[edge > 0]))
            m = nd.binary_erosion(m, disk(3))
        m = nd.gaussian_filter(m.astype(float), 0.8)          # мягкий край
        alpha = np.clip(m * 255, 0, 255).astype(np.uint8)
        a[:, :, 3] = alpha
        a[alpha == 0, :3] = 0
    ys, xs = np.nonzero(alpha > 128)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    fig = Image.fromarray(a).crop(box)
    k = FIG_H / fig.height
    fig = fig.resize((round(fig.width * k), FIG_H), Image.LANCZOS)
    out = Image.new('RGBA', (OUT, OUT), (0, 0, 0, 0))
    # по горизонтали — по центру тела (медиана столбцов), чтобы дубина не сдвигала фигуру
    fa = np.array(fig)[:, :, 3] > 128
    cols = np.nonzero(fa[int(fig.height * 0.1):int(fig.height * 0.35)].any(0))[0]   # голова/плечи
    cx = (cols.min() + cols.max()) / 2 if len(cols) else fig.width / 2
    out.alpha_composite(fig, (round(OUT / 2 - cx), FOOT - FIG_H))
    out.save(os.path.join(ROOT, f'assets/source/orc_{view}.png'))
    print(view, 'box', box, 'scale', round(k, 3), 'width', fig.width)

for v in ('front', 'side', 'back'):
    clean(v)
