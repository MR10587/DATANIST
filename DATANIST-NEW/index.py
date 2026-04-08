"""
WSGI entry point for Vercel deployment.
Vercel automatically detects the app variable.
"""

import sys
import traceback
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

print(f"[DEBUG] Python path: {sys.path[0]}")
print(f"[DEBUG] Current working directory: {Path.cwd()}")
print(f"[DEBUG] Current file: {Path(__file__).resolve()}")

try:
    print("[DEBUG] Attempting to import app.app...")
    from app.app import app
    print("[DEBUG] Successfully imported app")
except Exception as e:
    print(f"[ERROR] Failed to import app: {e}")
    print(f"[ERROR] Traceback:\n{traceback.format_exc()}")
    raise

# This is what Vercel looks for
__all__ = ["app"]
print("[DEBUG] index.py loaded successfully")

