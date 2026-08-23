import re
from datetime import date
from collections import defaultdict

CATEGORY_RULES = {
    'Food & Dining': ['swiggy','zomato','restaurant','cafe','dominos','pizza','blinkit','instamart','food'],
    'Shopping': ['amazon','flipkart','myntra','ajio','mall','shopping','ikea','nykaa'],
    'Transport': ['uber','ola','metro','fuel','petrol','diesel','rapido','irctc','flight','air india'],
    'Bills & Utilities': ['electric','bescom','mseb','water','internet','jio','airtel','vi ','recharge','gas'],
    'Entertainment': ['netflix','spotify','prime','youtube','movie','bookmyshow','gaming'],
    'Health': ['pharmacy','hospital','apollo','medplus','doctor','clinic','health'],
    'Housing': ['rent','landlord','housing','maintenance'],
    'Education': ['college','course','udemy','coursera','school','education'],
    'Salary': ['salary','payroll','stipend'],
    'Investment': ['mutual fund','sip','zerodha','groww','upstox','stocks','nse','bse'],
}

def categorize(description, amount=None):
    d = description.lower()
    for cat, terms in CATEGORY_RULES.items():
        if any(t in d for t in terms):
            return cat
    return 'Other' if (amount or 0) < 5000 else 'Large Expense'

def merchant_from(description):
    d = description.strip()
    d = re.sub(r'(?i)(upi|pos|neft|imps|rtgs|txn|ref)[\s:/_-]*[a-z0-9-]+', '', d)
    return d[:90].strip(' -_')

def detect_subscription(transactions):
    groups = defaultdict(list)
    for t in transactions:
        if t.txn_type == 'expense':
            key = re.sub(r'[^a-z ]', '', t.description.lower())
            groups[key].append(t)
    ids=set()
    for _, rows in groups.items():
        if len(rows) >= 2:
            for r in rows:
                ids.add(r.id)
    return ids

def detect_anomalies(transactions):
    by_cat=defaultdict(list)
    for t in transactions:
        if t.txn_type=='expense': by_cat[t.category].append(t.amount)
    stats={}
    for cat, vals in by_cat.items():
        mean=sum(vals)/len(vals)
        std=(sum((x-mean)**2 for x in vals)/len(vals))**0.5 or 1
        stats[cat]=(mean,std)
    ids=set()
    for t in transactions:
        if t.txn_type=='expense':
            mean,std=stats.get(t.category,(t.amount,1))
            if t.amount > mean + 2.2*std and t.amount > max(3000, mean*1.8): ids.add(t.id)
    return ids
