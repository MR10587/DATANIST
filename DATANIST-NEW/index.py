"""
WSGI entry point for Vercel deployment.
This file is required for serverless Flask deployment on Vercel.
"""

from app.app import app

# Export the app for Vercel
__all__ = ["app"]


if __name__ == "__main__":
    app.run()
