"""
WSGI entry point for Vercel deployment.
Vercel automatically detects the app variable.
"""

import sys
from pathlib import Path

# Ensure the app module can be imported
sys.path.insert(0, str(Path(__file__).parent))

# Import the Flask app for Vercel
from app.app import app

# This is what Vercel looks for
__all__ = ["app"]

