from datetime import date
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional

class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)

    @field_validator('name')
    @classmethod
    def validate_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError('Name is required')
        return value

    @field_validator('email')
    @classmethod
    def normalize_email(cls, value):
        return str(value).strip().lower()

class LoginIn(BaseModel):
    email: EmailStr
    password: str

    @field_validator('email')
    @classmethod
    def normalize_email(cls, value):
        return str(value).strip().lower()

class TokenOut(BaseModel):
    access_token: str
    user: dict

class TransactionIn(BaseModel):
    date: date
    description: str = Field(min_length=1, max_length=255)
    amount: float = Field(gt=0)
    type: str
    category: Optional[str] = None
    merchant: Optional[str] = None
    account: Optional[str] = None

    @field_validator('type')
    @classmethod
    def normalize_type(cls, value):
        v=value.strip().lower()
        if v in {'credit','cr','income','deposit'}: return 'income'
        if v in {'debit','dr','expense','payment','withdrawal'}: return 'expense'
        raise ValueError('Type must be income/credit or expense/debit')

class TransactionBulkIn(BaseModel):
    transactions: list[TransactionIn] = Field(min_length=1, max_length=200)

class TransactionDeleteIn(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=500)

class BudgetIn(BaseModel):
    category: str
    monthly_limit: float
    month: str
class GoalIn(BaseModel):
    name: str
    target_amount: float
    current_amount: float = 0
    target_date: Optional[date]=None
class InvestmentIn(BaseModel):
    asset: str
    asset_type: str
    invested_amount: float
    current_value: float
    units: float = 0
class AssetIn(BaseModel):
    name: str
    asset_type: str
    value: float
class LiabilityIn(BaseModel):
    name: str
    liability_type: str
    balance: float
class ChatIn(BaseModel):
    message: str



class ForgotPasswordIn(BaseModel):
    email: EmailStr

    @field_validator('email')
    @classmethod
    def normalize_email(cls, value):
        return str(value).strip().lower()

class ResetPasswordIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator('email')
    @classmethod
    def normalize_email(cls, value):
        return str(value).strip().lower()

class ProfileUpdateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=40)
    date_of_birth: Optional[date] = None
    occupation: Optional[str] = Field(default=None, max_length=120)
    location: Optional[str] = Field(default=None, max_length=160)

    @field_validator('phone', 'occupation', 'location', mode='before')
    @classmethod
    def empty_to_none(cls, value):
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

class VerificationCodeIn(BaseModel):
    channel: str
    code: str = Field(min_length=6, max_length=6)
