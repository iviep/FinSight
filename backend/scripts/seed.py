from app.database import Base, engine

# Production application: no demo users or fake financial records are created.
Base.metadata.create_all(bind=engine)
print('FinSight database schema is ready. No demo account or seed data was created.')
