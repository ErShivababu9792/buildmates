"""
Exact safety rules (same as the app's src/lib/guard.js, so both sides agree).
Rules run before the ML model: they are explainable and never miss a phone number.
"""
import re

_RULES = [
    ("block", "Contact sharing",
     "Phone numbers and social IDs can’t be shared in the first 7 days. Keep talking here, it keeps you both safe.",
     [r"\d([\s.-]?\d){9}",
      r"\b(num|numb|nmbr|number|no\.?|mobile|contact)\s*(de|do|dena|bhej|bhejo|send|share|kya hai|batao)\b",
      r"\b(whatsapp|whats app|wa|insta|instagram|snap|snapchat|telegram)\b\s*(id|pe|par|on|de|do|kar|karo|chat)?"]),
    ("block", "Money request",
     "Asking for money isn’t allowed on BuildMates. If someone asks you to pay to join a project, report them.",
     [r"₹\s?\d", r"\brs\.?\s?\d", r"\b\d+\s?(rs|rupees|rupaye)\b",
      r"\b(upi|gpay|google pay|phonepe|paytm)\b",
      r"\b(paise|paisa|money|fees?)\s*(bhej|bhejo|do|de|dena|send|pay|lagegi|lagega)\b",
      r"\b(invest|investment|double your|pay me|send money|registration fee)\b"]),
    ("block", "Abusive language", "Abusive words aren’t allowed. Please keep it respectful.",
     [r"\b(idiot|stupid|dumb|moron|fuck|fucking|fuck off|shit|bitch|bastard|asshole|chutiya|chutiye|chutiyapa|bewakoof|bewkoof|kamina|kamine|kameena|kaminey|kutta|kutte|kutiya|saala|saale|sala|harami|haramkhor|bc|mc|bsdk|bhosdike|bhosdi|madarchod|bhenchod|behenchod|lavde|lode|gaandu|gandu|randi|suar|ghatiya|nalayak|gadha|gadhe|ullu|bakwas kar|chup kar|nikal yahan se|get lost|loser)\b"]),
    ("warn", "Personal, not about the project",
     "This sounds personal rather than about the project. BuildMates is for building together.",
     [r"\b(beautiful|cute|hot|sexy|jaan|baby|babu|darling|single ho|girlfriend|boyfriend|gf|bf|pyaar|love you|date pe|date par|date on)\b"]),
    ("warn", "Link", "Links can be unsafe. Only open links from people you trust.",
     [r"(https?://|www\.|bit\.ly|tinyurl)"]),
]
_COMPILED = [(lvl, kind, msg, [re.compile(p) for p in pats]) for lvl, kind, msg, pats in _RULES]


def check_rules(text: str):
    t = f" {text.lower()} "
    for level, kind, msg, patterns in _COMPILED:
        if any(p.search(t) for p in patterns):
            return {"level": level, "kind": kind, "msg": msg}
    return None


_BANNED_IDEAS = re.compile(r"\b(bet|betting|gambl\w*|satta|casino|assignment writing|proxy attendance|hack(ing)? (accounts?|instagram|whatsapp)|fake (id|certificates?|degree)|drugs?)\b")
_HOW_WORDS = re.compile(r"\b(using|via|algorithm|api|qr|razorpay|machine learning|ml model|formula|secret|patent)\b")


def idea_rules(title: str, pitch: str, detail: str):
    out = []
    everything = f"{title} {pitch} {detail}".lower()
    if _BANNED_IDEAS.search(everything):
        out.append({"level": "bad", "msg": "This idea may break our rules (betting, cheating, hacking or fake documents). It will go to admin review before anyone sees it."})
    if _HOW_WORDS.search(pitch.lower()):
        out.append({"level": "warn", "msg": "Your public line may reveal how your solution works. Say what problem it solves, not how."})
    return out
