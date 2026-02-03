#!/usr/bin/env python3
# تحويل ملف Excel (xls/xlsx) إلى CSV بنفس أعمدة الإرشاد الطلابي.
# الاستخدام:
#   python3 convert_xls_to_csv.py input.xls output.csv
import sys, re
import pandas as pd

def digits_only(x):
    s=str(x)
    return re.sub(r'\D','',s)

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 convert_xls_to_csv.py input.xls output.csv")
        sys.exit(1)

    src, out = sys.argv[1], sys.argv[2]
    xl = pd.ExcelFile(src)
    sheet = "Sheet2" if "Sheet2" in xl.sheet_names else xl.sheet_names[0]
    df = xl.parse(sheet, header=2)

    # محاولة تسمية الأعمدة مثل ملف الإرشاد المرفق
    cols = list(df.columns)
    # غالبًا: [Unnamed:0, Student  Info Table, Unnamed:2, Unnamed:3, Unnamed:4, Unnamed:5]
    mapping = {}
    for c in cols:
        if str(c).strip() == "Student  Info Table":
            mapping[c] = "الجوال"
        elif str(c).strip() == "Unnamed: 2":
            mapping[c] = "الفصل"
        elif str(c).strip() == "Unnamed: 3":
            mapping[c] = "رقم الصف"
        elif str(c).strip() == "Unnamed: 4":
            mapping[c] = "اسم الطالب"
        elif str(c).strip() == "Unnamed: 5":
            mapping[c] = "رقم الطالب"

    df = df.rename(columns=mapping)
    if "Unnamed: 0" in df.columns:
        df = df.drop(columns=["Unnamed: 0"])

    df = df[df.get("اسم الطالب").notna()]
    df = df[df["اسم الطالب"].astype(str).str.strip()!=""]
    df = df[df["اسم الطالب"]!="اسم الطالب"]

    if "الجوال" in df.columns: df["الجوال"] = df["الجوال"].apply(digits_only)
    if "رقم الطالب" in df.columns: df["رقم الطالب"] = df["رقم الطالب"].apply(digits_only)
    if "رقم الصف" in df.columns: df["رقم الصف"] = df["رقم الصف"].apply(lambda x: digits_only(x) if pd.notna(x) else "")
    if "الفصل" in df.columns: df["الفصل"] = df["الفصل"].apply(lambda x: digits_only(x) if pd.notna(x) else "")

    df.to_csv(out, index=False, encoding="utf-8-sig")
    print(f"Saved: {out}  (rows={len(df)})")

if __name__ == "__main__":
    main()
