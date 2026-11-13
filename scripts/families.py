"""Draft tag -> faction mapping. Writes tag_families.csv (editable) and checks coverage against dash.json.

Usage: python families.py dash.json tag_families.csv
"""
import sys, json, csv

FAMILIES = [  # key, name, palette slot order (fixed)
    ('strategy', '策略与模拟'), ('narrative', '叙事与冒险'), ('social', '多人与社交'), ('theme', '题材与美术'),
    ('rpg', 'RPG 与成长'), ('cozy', '休闲与解谜'), ('dark', '恐怖与黑暗'), ('action', '动作与竞技'),
]
M = {
 'action': """Action|Shooter|Platformer|Combat|Arcade|2D Platformer|FPS|Rogue-like|Rogue-lite|Side Scroller|3D Platformer|Action-Adventure|Action Roguelike|Bullet Hell|Shoot 'Em Up|Hack and Slash|Top-Down Shooter|Precision Platformer|Stealth|Third-Person Shooter|Arena Shooter|Runner|Fast-Paced|Beat 'em up|Souls-like|Parkour|Metroidvania|2D Fighter|Twin Stick Shooter|Fighting|3D Fighter|Swordplay|Vehicular Combat|Hero Shooter|Spectacle fighter|Bullet Time|Combat Racing|Gun Customization|Character Action Game|Martial Arts|Looter Shooter|Ninja|Destruction|Score Attack|Racing|Sports|Driving|Tanks|Mechs|Difficult|Perma Death|Quick-Time Events|Rhythm|Music|Time Manipulation""",
 'strategy': """Simulation|Strategy|Sandbox|Building|Management|Tactical|Turn-Based Strategy|Turn-Based Tactics|Crafting|Resource Management|Base-Building|Time Management|Tower Defense|Economy|Real Time Tactics|RTS|City Builder|Flight|Wargame|Turn-Based|Grid-Based Movement|Automobile Sim|Automation|Space Sim|Capitalism|Grand Strategy|Colony Sim|6DOF|Auto Battler|God Game|Trading|Mining|Action RTS|Hex Grid|Transportation|Political Sim|Hunting|Survival|Open World Survival Craft|Card Game|Tabletop|Board Game|Deckbuilding|Card Battler|Roguelike Deckbuilder|Physics""",
 'rpg': """RPG|Action RPG|Character Customization|Dungeon Crawler|JRPG|Strategy RPG|RPGMaker|Tactical RPG|Party-Based RPG|Loot|CRPG|Mystery Dungeon|Creature Collector|Inventory Management|Turn-Based Combat|Magic""",
 'narrative': """Adventure|Story Rich|Exploration|Mystery|Choices Matter|Visual Novel|Multiple Endings|Point & Click|Drama|Interactive Fiction|Choose Your Own Adventure|Walking Simulator|Emotional|Investigation|Text-Based|Narration|Detective|Cinematic|Romance|Dating Sim|Conversation|Nonlinear|Lore-Rich|Short|Philosophical|FMV|Dynamic Narration|Narrative|Open World|Immersive Sim|Immersive|Dark Humor|Dark Comedy|Satire|Political""",
 'cozy': """Casual|Puzzle|Relaxing|Cute|Family Friendly|Logic|Hidden Object|Puzzle-Platformer|Clicker|Idler|Match 3|Word Game|Solitaire|Sokoban|Cozy|Wholesome|Farming Sim|Agriculture|Cooking|Life Sim|Fishing|Cats|Dog|Typing|Minigames|Escape Room|Education|Collectathon|Funny|Comedy|Parody|Memes""",
 'social': """Multiplayer|PvE|PvP|Co-op|Online Co-Op|Local Multiplayer|Local Co-Op|4 Player Local|Massively Multiplayer|Team-Based|Competitive|Split Screen|e-sports|Class-Based|Battle Royale|Co-op Campaign|Party Game|MMORPG""",
 'dark': """Horror|Psychological Horror|Dark|Violent|Gore|Survival Horror|Zombies|Thriller|Psychological|Demons|Supernatural|Lovecraftian|Gothic|Blood|Vampire|Dark Fantasy|Post-apocalyptic|Dystopian|Noir|Crime|Conspiracy""",
 'theme': """2D|3D|Colorful|Pixel Graphics|Fantasy|First-Person|Retro|Anime|Sci-fi|Top-Down|Stylized|Third Person|Cartoony|Realistic|Minimalist|Old School|Hand-drawn|Space|Cartoon|Futuristic|Medieval|1990's|Nature|2.5D|Isometric|Historical|Abstract|1980s|Military|Aliens|Robots|Cyberpunk|War|Comic Book|Modern|Alternate History|Mythology|Dragons|America|Beautiful|Voxel|Underground|World War II|Pirates|Underwater|Time Travel|Dinosaurs|Steampunk|Atmospheric|Surreal|Psychedelic|Experimental|Artificial Intelligence|Science|Faith|Female Protagonist|LGBTQ+|Hacking|Great Soundtrack|Soundtrack""",
}
tags = json.load(open(sys.argv[1], encoding='utf-8'))['tags']
names = dict(FAMILIES)
assign = {}
for fam, s in M.items():
    for t in s.split('|'):
        assert t not in assign, f'duplicate {t}'
        assign[t] = fam
unknown = [t for t in assign if t not in tags]
missing = sorted(t for t in tags if t not in assign)
print('not in data (ignored):', unknown)
print('-> 通用 (other):', missing)
with open(sys.argv[2], 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f); w.writerow(['tag', 'family', 'family_name', 'games'])
    for t in sorted(tags, key=lambda k: (assign.get(k, 'zz'), -tags[k]['n'])):
        fam = assign.get(t, 'other')
        w.writerow([t, fam, names.get(fam, '通用'), tags[t]['n']])
from collections import Counter
print(Counter(assign.get(t, 'other') for t in tags))
