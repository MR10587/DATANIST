"""
WSGI entry point for Vercel deployment.
This file is required for serverless Flask deployment on Vercel.
"""

import sys
from pathlib import Path

# Ensure the app module can be imported
sys.path.insert(0, str(Path(__file__).parent))

try:
    from app.app import app
except ImportError as e:
    print(f"ERROR: Failed to import app: {e}")
    raise

# Export the app for Vercel
__all__ = ["app"]


if __name__ == "__main__":
    app.run()
