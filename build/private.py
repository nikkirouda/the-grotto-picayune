#!/usr/bin/env python3
"""The private file: private.enc holds everything personal (extra sources, preferences, votes),
encrypted with NEWS_PASSPHRASE. Format: 16-byte salt | 12-byte nonce | AES-256-GCM ciphertext,
key = PBKDF2-HMAC-SHA256(passphrase, salt, 200 000 rounds). The site uses the same format in WebCrypto.

  NEWS_PASSPHRASE=… python3 build/private.py show                 # print the decrypted JSON
  NEWS_PASSPHRASE=… python3 build/private.py put --from file.json # (re)write private.enc from a JSON file
"""
import argparse, json, os, sys

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRIVATE_PATH = os.path.join(ROOT, "private.enc")
ITERATIONS = 200_000

def _key(passphrase: str, salt: bytes) -> bytes:
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS).derive(passphrase.encode("utf-8"))

def derive_key(passphrase: str, salt: bytes) -> bytes:
    """Same derivation the page uses (PBKDF2-SHA256, 200 000 rounds). One key per salt."""
    return _key(passphrase, salt)

def encrypt_with_key(data: bytes, key: bytes) -> bytes:
    """nonce | ciphertext — for the many small article files, which share one key per build."""
    nonce = os.urandom(12)
    return nonce + AESGCM(key).encrypt(nonce, data, None)

def encrypt_bytes(data: bytes, passphrase: str) -> bytes:
    salt, nonce = os.urandom(16), os.urandom(12)
    return salt + nonce + AESGCM(_key(passphrase, salt)).encrypt(nonce, data, None)

def decrypt_bytes(blob: bytes, passphrase: str) -> bytes:
    salt, nonce, ct = blob[:16], blob[16:28], blob[28:]
    return AESGCM(_key(passphrase, salt)).decrypt(nonce, ct, None)

def load_private(passphrase: str):
    """Returns the private dict, or None when there is no private.enc."""
    if not os.path.exists(PRIVATE_PATH):
        return None
    if not passphrase:
        sys.exit("private.enc exists but NEWS_PASSPHRASE is not set; the build cannot read your sources and preferences.")
    with open(PRIVATE_PATH, "rb") as f:
        return json.loads(decrypt_bytes(f.read(), passphrase).decode("utf-8"))

def save_private(data: dict, passphrase: str):
    raw = json.dumps(data, ensure_ascii=False, indent=1).encode("utf-8")
    with open(PRIVATE_PATH, "wb") as f:
        f.write(encrypt_bytes(raw, passphrase))

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["show", "put"])
    ap.add_argument("--from", dest="src")
    a = ap.parse_args()
    pw = os.environ.get("NEWS_PASSPHRASE", "")
    if not pw:
        sys.exit("set NEWS_PASSPHRASE")
    if a.cmd == "show":
        print(json.dumps(load_private(pw), indent=1, ensure_ascii=False))
    else:
        with open(a.src, encoding="utf-8") as f:
            save_private(json.load(f), pw)
        print("wrote", PRIVATE_PATH)
