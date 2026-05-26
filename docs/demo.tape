# VHS tape for the README hero GIF.
#
# Install VHS once:        brew install vhs        (or: go install github.com/charmbracelet/vhs@latest)
# Regenerate the GIF:      vhs docs/demo.tape      (writes to docs/demo.gif)
#
# Tweak the friend login on the `japonette cluster --user ...` line
# below to someone you actually have in your watchlist (or any active
# user — `japonette active` to pick one).

Output docs/demo.gif

Set Shell "zsh"
Set FontFamily "JetBrainsMono Nerd Font"
Set FontSize 14
Set Width 1200
Set Height 720
Set Theme "Catppuccin Mocha"
Set TypingSpeed 60ms
Set PlaybackSpeed 1.0

# ── Active users at your campus ───────────────────────────────────────
Type "japonette active -n 8"
Sleep 500ms
Enter
Sleep 4s

# ── Friends online ────────────────────────────────────────────────────
Type "japonette friends online"
Sleep 500ms
Enter
Sleep 3s

# ── Find a friend on the cluster map ─────────────────────────────────
Type "japonette cluster --user <your-friend>"
Sleep 500ms
Enter
Sleep 5s
