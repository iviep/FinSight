import os
import base64
import hashlib
import hmac
import secrets
import binascii
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from .database import get_db
from .models import User
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret')
ALGORITHM = 'HS256'
EXPIRE = int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', '1440'))
PBKDF2_ITERATIONS = int(os.getenv('PBKDF2_ITERATIONS', '310000'))

oauth2 = OAuth2PasswordBearer(tokenUrl='/api/auth/login')


def _pbkdf2_hash(password: str) -> str:
    if not isinstance(password, str) or not password:
        raise ValueError('Password cannot be empty')
    # PBKDF2 accepts arbitrary-length passwords, unlike bcrypt's 72-byte cap.
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, PBKDF2_ITERATIONS)
    return 'pbkdf2_sha256${}${}${}'.format(
        PBKDF2_ITERATIONS,
        base64.urlsafe_b64encode(salt).decode().rstrip('='),
        base64.urlsafe_b64encode(digest).decode().rstrip('='),
    )


def _pbkdf2_verify(password: str, encoded: str) -> bool:
    try:
        scheme, iterations, salt_b64, digest_b64 = encoded.split('$', 3)
        if scheme != 'pbkdf2_sha256':
            return False
        salt = base64.urlsafe_b64decode(salt_b64 + '=' * (-len(salt_b64) % 4))
        expected = base64.urlsafe_b64decode(digest_b64 + '=' * (-len(digest_b64) % 4))
        actual = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError, binascii.Error):
        return False


def hash_password(password: str):
    return _pbkdf2_hash(password)


def verify_password(password: str, hashed: str):
    if not hashed:
        return False
    if hashed.startswith('pbkdf2_sha256$'):
        return _pbkdf2_verify(password, hashed)

    # Backward compatibility for any legacy Passlib/bcrypt hashes already stored.
    # bcrypt's native module does not have Passlib's __about__ compatibility issue.
    if hashed.startswith(('$2a$', '$2b$', '$2y$')):
        try:
            import bcrypt
            return bool(bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8')))
        except Exception:
            return False
    return False


def create_token(user_id: int):
    exp = datetime.now(timezone.utc) + timedelta(minutes=EXPIRE)
    return jwt.encode({'sub': str(user_id), 'exp': exp}, SECRET_KEY, algorithm=ALGORITHM)


def current_user(token: str = Depends(oauth2), db: Session = Depends(get_db)):
    cred = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid authentication token')
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get('sub'))
    except (JWTError, TypeError, ValueError):
        raise cred
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise cred
    return user
