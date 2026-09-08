<#
    Template for secrets.local.ps1

    Copy this file to "secrets.local.ps1" (same folder) and fill in your own
    keys. secrets.local.ps1 is git-ignored, so your keys never get committed.

    start-all.ps1 automatically loads secrets.local.ps1 if it exists.
    Every value is optional — the app degrades gracefully without any of them:
      - No GROQ_API_KEY        -> chat falls back to local Ollama
      - No RAZORPAY_KEY_*      -> payments run in demo/simulated mode
      - No VOICE_CALL_SERVICE_URL -> "Call Vendor" reports the voice channel
                                     as unavailable instead of placing a call
#>

# Groq (cloud LLM, ~1-2s chat latency). Get a free key at https://console.groq.com/keys
$env:GROQ_API_KEY = ""
# $env:GROQ_MODEL = "openai/gpt-oss-120b"   # optional override, this is the default

# Razorpay (test mode). Get test keys at https://dashboard.razorpay.com/app/keys
$env:RAZORPAY_KEY_ID = ""
$env:RAZORPAY_KEY_SECRET = ""

# External AI voice-calling service /call/initiate endpoint
$env:VOICE_CALL_SERVICE_URL = ""
