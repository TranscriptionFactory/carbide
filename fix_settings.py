import json, pathlib

p = pathlib.Path.home() / "Library/Application Support/com.carbide.desktop/carbide/settings.json"
data = json.loads(p.read_text())

# Walk down to find the deepest "settings" object that contains real keys
def find_real_settings(obj):
    if not isinstance(obj, dict):
        return obj
    s = obj.get("settings")
    if isinstance(s, dict) and "settings" in s and isinstance(s["settings"], dict):
        # Double nested — the inner one has the real data
        return find_real_settings(s)
    return obj

data = find_real_settings(data)

# Validate
settings = data.get("settings", {})
themes = settings.get("user_themes", [])
print(f"Found {len(settings)} settings keys, {len(themes)} user themes")
theme_names = [t.get("name", "?") for t in themes]
print(f"Themes: {', '.join(theme_names)}")

p.write_text(json.dumps(data, indent=2, ensure_ascii=False))
print("Written successfully")
