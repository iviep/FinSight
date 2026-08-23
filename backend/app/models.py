from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.sql import func
from .database import Base

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    avatar_url = Column(Text, nullable=True)
    phone = Column(String(40), nullable=True)
    phone_verified = Column(Boolean, default=False, nullable=False)
    email_verified = Column(Boolean, default=False, nullable=False)
    date_of_birth = Column(Date, nullable=True)
    occupation = Column(String(120), nullable=True)
    location = Column(String(160), nullable=True)
    email_verification_code = Column(String(255), nullable=True)
    email_verification_expires = Column(DateTime(timezone=True), nullable=True)
    phone_verification_code = Column(String(255), nullable=True)
    phone_verification_expires = Column(DateTime(timezone=True), nullable=True)
    password_reset_code = Column(String(255), nullable=True)
    password_reset_expires = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Transaction(Base):
    __tablename__ = 'transactions'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), index=True)
    txn_date = Column(Date, nullable=False)
    description = Column(String(255), nullable=False)
    amount = Column(Float, nullable=False)
    txn_type = Column(String(20), nullable=False)  # income/expense
    category = Column(String(80), nullable=False, default='Other')
    account = Column(String(100), default='Primary')
    merchant = Column(String(160), default='')
    is_subscription = Column(Boolean, default=False)
    is_anomaly = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Budget(Base):
    __tablename__ = 'budgets'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), index=True)
    category = Column(String(80), nullable=False)
    monthly_limit = Column(Float, nullable=False)
    month = Column(String(7), nullable=False)  # YYYY-MM

class Goal(Base):
    __tablename__ = 'goals'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), index=True)
    name = Column(String(160), nullable=False)
    target_amount = Column(Float, nullable=False)
    current_amount = Column(Float, default=0)
    target_date = Column(Date, nullable=True)
    color = Column(String(20), default='#7c5cff')

class Investment(Base):
    __tablename__ = 'investments'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), index=True)
    asset = Column(String(160), nullable=False)
    asset_type = Column(String(80), nullable=False)
    invested_amount = Column(Float, nullable=False)
    current_value = Column(Float, nullable=False)
    units = Column(Float, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Asset(Base):
    __tablename__ = 'assets'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), index=True)
    name = Column(String(160), nullable=False)
    asset_type = Column(String(80), nullable=False)
    value = Column(Float, nullable=False)

class Liability(Base):
    __tablename__ = 'liabilities'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), index=True)
    name = Column(String(160), nullable=False)
    liability_type = Column(String(80), nullable=False)
    balance = Column(Float, nullable=False)

class Insight(Base):
    __tablename__ = 'insights'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), index=True)
    title = Column(String(200), nullable=False)
    detail = Column(Text, nullable=False)
    severity = Column(String(20), default='info')
