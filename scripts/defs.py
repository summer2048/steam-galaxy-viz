"""Success thresholds shared by export.py (per-tag aggregates) and export_games.py (per-game table).

The map shows only the review rule. Studio still offers all three, so the owner and gross thresholds live here
rather than in dash_offline.json, and rerunning export.py can never leave export_games.py without them.
Owner counts are the top of each game's SteamSpy band, so the owner and gross rules are upper-bound estimates.
"""
REVIEW_T = 500          # Steam reviews
OWN_T = 200_000         # top of the SteamSpy owner band
GROSS_T = 1_000_000     # owner band top × list price, USD, before Steam's cut and discounts
