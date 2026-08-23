import os
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from dotenv import load_dotenv
load_dotenv()
DB_NAME='finsight'
conn=psycopg2.connect(host='localhost',port=5432,user='postgres',password='2301',dbname='postgres')
conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
cur=conn.cursor(); cur.execute('SELECT 1 FROM pg_database WHERE datname=%s',(DB_NAME,))
if not cur.fetchone(): cur.execute(f'CREATE DATABASE {DB_NAME}') ; print('Created database:',DB_NAME)
else: print('Database already exists:',DB_NAME)
cur.close();conn.close()
