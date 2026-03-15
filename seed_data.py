"""Seed Firestore with mock banking data and generate demo QR code assets."""

import os
import sys
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def seed_firestore():
    from google.cloud import firestore

    project = os.getenv("FIRESTORE_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT")
    db = firestore.Client(project=project)

    print("Seeding Firestore...")

    # ------------------------------------------------------------------
    # Accounts
    # ------------------------------------------------------------------
    accounts = [
        {
            "id": "acc_demo_01",
            "user_id": "user_demo_01",
            "name": "Sophie van den Berg",
            "iban": "NL91ABNA0417164300",
            "balance": 2847.50,
            "currency": "EUR",
            "account_type": "checking",
        },
        {
            "id": "acc_demo_02",
            "user_id": "user_demo_02",
            "name": "Liam de Vries",
            "iban": "NL44RABO0123456789",
            "balance": 5120.00,
            "currency": "EUR",
            "account_type": "checking",
        },
    ]

    for acc in accounts:
        acc_id = acc.pop("id")
        db.collection("accounts").document(acc_id).set(acc)
        acc["id"] = acc_id
        print(f"  ✓ account {acc_id}")

    # ------------------------------------------------------------------
    # Contacts
    # ------------------------------------------------------------------
    contacts = [
        {"account_id": "acc_demo_01", "name": "David", "iban": "NL86INGB0002445588", "bank": "ING"},
        {"account_id": "acc_demo_01", "name": "Emma", "iban": "NL44RABO0123456789", "bank": "Rabobank"},
        {"account_id": "acc_demo_01", "name": "Thomas", "iban": "NL58ABNA0417164301", "bank": "ABN AMRO"},
        {"account_id": "acc_demo_02", "name": "Sophie", "iban": "NL91ABNA0417164300", "bank": "ABN AMRO"},
    ]

    for contact in contacts:
        db.collection("contacts").add(contact)

    print(f"  ✓ {len(contacts)} contacts")

    # ------------------------------------------------------------------
    # Transactions (50 entries for acc_demo_01)
    # ------------------------------------------------------------------
    today = date.today()

    transactions = []

    # Coffee (lots of it — for the demo query)
    coffee_shops = [
        ("Starbucks Amsterdam Centraal", "coffee"),
        ("Nespresso Boutique", "coffee"),
        ("Café de Jaren", "coffee"),
        ("Coffee & Coconuts", "coffee"),
        ("Lot Sixty One Coffee", "coffee"),
    ]
    coffee_dates = [today - timedelta(days=d) for d in [5, 18, 31, 44, 55, 68, 82, 95, 108, 122,
                                                          135, 148, 162, 175, 188, 200, 213, 226, 240, 253]]
    for i, d in enumerate(coffee_dates):
        merchant, cat = coffee_shops[i % len(coffee_shops)]
        transactions.append({
            "account_id": "acc_demo_01",
            "date": d.isoformat(),
            "amount": -round(3.50 + (i % 5) * 1.50, 2),
            "merchant": merchant,
            "category": "coffee",
        })

    # Groceries
    grocery_shops = [("Albert Heijn", "groceries"), ("Jumbo", "groceries"), ("Lidl", "groceries")]
    for i in range(12):
        d = today - timedelta(days=7 * i + 3)
        merchant, cat = grocery_shops[i % 3]
        transactions.append({
            "account_id": "acc_demo_01",
            "date": d.isoformat(),
            "amount": -round(45.00 + (i % 4) * 22.50, 2),
            "merchant": merchant,
            "category": "groceries",
        })

    # Transport
    for i in range(8):
        d = today - timedelta(days=10 * i + 2)
        transactions.append({
            "account_id": "acc_demo_01",
            "date": d.isoformat(),
            "amount": -round(20.00 + (i % 3) * 15.00, 2),
            "merchant": "NS Railways" if i % 2 == 0 else "GVB Amsterdam",
            "category": "transport",
        })

    # Utilities (past)
    for i in range(3):
        d = today - timedelta(days=30 * (i + 1))
        transactions.append({
            "account_id": "acc_demo_01",
            "date": d.isoformat(),
            "amount": -94.20,
            "merchant": "Vattenfall N.V.",
            "category": "utilities",
        })

    # Dining
    restaurants = [("Restaurant De Kas", "dining"), ("Moeders Amsterdam", "dining"), ("Foodhallen", "dining")]
    for i in range(5):
        d = today - timedelta(days=14 * i + 6)
        merchant, cat = restaurants[i % 3]
        transactions.append({
            "account_id": "acc_demo_01",
            "date": d.isoformat(),
            "amount": -round(28.00 + (i % 4) * 12.00, 2),
            "merchant": merchant,
            "category": "dining",
        })

    # Salary (income)
    for i in range(3):
        d = today.replace(day=25) - timedelta(days=30 * i)
        transactions.append({
            "account_id": "acc_demo_01",
            "date": d.isoformat(),
            "amount": 3200.00,
            "merchant": "Employer NL B.V.",
            "category": "income",
        })

    batch = db.batch()
    for txn in transactions:
        ref = db.collection("transactions").document()
        batch.set(ref, txn)
    batch.commit()

    print(f"  ✓ {len(transactions)} transactions for acc_demo_01")
    print("Firestore seeding complete.\n")


def generate_demo_qr():
    """Generate a demo Vattenfall bill QR code (SEPA EPC format)."""
    try:
        import qrcode
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("qrcode/Pillow not installed — skipping QR generation.")
        return

    assets_dir = Path(__file__).parent / "assets"
    assets_dir.mkdir(exist_ok=True)

    # SEPA EPC QR payload (standard format)
    # BCD = Service Tag
    # 002 = Version
    # 1 = Character Set (UTF-8)
    # SCT = Identification (SEPA Credit Transfer)
    # BIC, Name, IBAN, Amount, Purpose, Remittance, Info
    epc_payload = (
        "BCD\n"
        "002\n"
        "1\n"
        "SCT\n"
        "ABNANL2A\n"
        "Vattenfall N.V.\n"
        "NL58ABNA0417164300\n"
        "EUR94.20\n"
        "\n"
        "INV-2026-03-8821\n"
        "Energy bill March 2026"
    )

    qr = qrcode.QRCode(
        version=3,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(epc_payload)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")

    # Create a simple bill-looking image
    bill_width, bill_height = 600, 800
    bill = Image.new("RGB", (bill_width, bill_height), color="#FAFAFA")
    draw = ImageDraw.Draw(bill)

    # Header bar
    draw.rectangle([0, 0, bill_width, 80], fill="#003D7A")

    # Try to use a default font, fall back to default
    try:
        font_large = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 28)
        font_medium = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 20)
        font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
    except (OSError, AttributeError):
        font_large = ImageFont.load_default()
        font_medium = font_large
        font_small = font_large

    # Header text
    draw.text((20, 20), "Vattenfall", fill="white", font=font_large)
    draw.text((20, 52), "Energy Solutions", fill="#AAC8F0", font=font_small)

    # Invoice details
    draw.text((20, 110), "INVOICE", fill="#003D7A", font=font_large)
    draw.line([20, 145, bill_width - 20, 145], fill="#CCCCCC", width=1)

    details = [
        ("Invoice number:", "INV-2026-03-8821"),
        ("Date:", "March 1, 2026"),
        ("Due date:", "March 31, 2026"),
        ("Customer:", "Sophie van den Berg"),
        ("Address:", "Prinsengracht 263, Amsterdam"),
        ("", ""),
        ("Electricity (Feb–Mar):", "€ 74.20"),
        ("Gas (Feb–Mar):", "€ 20.00"),
        ("", ""),
        ("TOTAL DUE:", "€ 94.20"),
    ]

    y = 165
    for label, value in details:
        if label == "TOTAL DUE:":
            draw.line([20, y - 5, bill_width - 20, y - 5], fill="#CCCCCC", width=1)
            draw.text((20, y), label, fill="#003D7A", font=font_medium)
            draw.text((bill_width - 20 - 100, y), value, fill="#003D7A", font=font_medium)
            y += 30
        elif label:
            draw.text((20, y), label, fill="#555555", font=font_small)
            draw.text((230, y), value, fill="#222222", font=font_small)
            y += 25
        else:
            y += 10

    # QR code section
    draw.line([20, 520, bill_width - 20, 520], fill="#CCCCCC", width=1)
    draw.text((20, 535), "Pay instantly — scan QR code", fill="#003D7A", font=font_medium)
    draw.text((20, 562), "iDEAL / Wero / SEPA Credit Transfer", fill="#888888", font=font_small)

    qr_size = 200
    qr_resized = qr_img.resize((qr_size, qr_size), Image.NEAREST)
    qr_x = (bill_width - qr_size) // 2
    bill.paste(qr_resized, (qr_x, 590))

    # Footer
    draw.text((20, 760), "Vattenfall N.V. | IBAN: NL58ABNA0417164300", fill="#AAAAAA", font=font_small)

    output_path = assets_dir / "vattenfall_bill_qr.png"
    bill.save(output_path)
    print(f"Demo QR bill saved to: {output_path}")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("all", "firestore"):
        seed_firestore()

    if mode in ("all", "qr"):
        generate_demo_qr()
