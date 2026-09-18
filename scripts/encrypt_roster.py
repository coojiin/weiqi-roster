#!/usr/bin/env python3
"""Encrypt roster JSON for the static site.

Reads plaintext roster, encrypts with PBKDF2-SHA256 + AES-GCM using a
password from WEIQI_ROSTER_PASSWORD (or --password). Writes a Web Crypto–
compatible package to data/roster.enc.json.

Never commit the plaintext JSON or the password.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import secrets
import sys
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# Defaults match browser Web Crypto (PBKDF2-SHA256, AES-GCM 256)
ITERATIONS = 210_000
SALT_LEN = 16
IV_LEN = 12
KEY_LEN = 32

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "data" / "roster.enc.json"


def derive_key(password: str, salt: bytes, iterations: int) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=KEY_LEN,
        salt=salt,
        iterations=iterations,
    )
    return kdf.derive(password.encode("utf-8"))


def encrypt(plaintext: bytes, password: str) -> dict:
    salt = secrets.token_bytes(SALT_LEN)
    iv = secrets.token_bytes(IV_LEN)
    key = derive_key(password, salt, ITERATIONS)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, plaintext, None)  # includes 16-byte tag
    return {
        "v": 1,
        "kdf": "PBKDF2-SHA256",
        "cipher": "AES-GCM",
        "iterations": ITERATIONS,
        "salt": base64.b64encode(salt).decode("ascii"),
        "iv": base64.b64encode(iv).decode("ascii"),
        "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "-i",
        "--input",
        type=Path,
        default=Path("/workspace/weiqi-roster/roster_all.json"),
        help="Path to plaintext roster JSON",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=DEFAULT_OUT,
        help="Path for encrypted package JSON",
    )
    parser.add_argument(
        "-p",
        "--password",
        default=os.environ.get("WEIQI_ROSTER_PASSWORD"),
        help="Encryption password (or set WEIQI_ROSTER_PASSWORD)",
    )
    args = parser.parse_args()

    if not args.password:
        print("Error: password required via --password or WEIQI_ROSTER_PASSWORD", file=sys.stderr)
        return 1
    if not args.input.is_file():
        print(f"Error: input not found: {args.input}", file=sys.stderr)
        return 1

    raw = args.input.read_bytes()
    # Validate JSON and optionally compact for smaller ciphertext
    data = json.loads(raw)
    if not isinstance(data, list):
        print("Error: expected a JSON array", file=sys.stderr)
        return 1
    compact = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    print(f"Encrypting {len(data)} records ({len(compact)} bytes)…")

    package = encrypt(compact, args.password)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.output} ({args.output.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
