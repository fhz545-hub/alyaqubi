// بنود السلوك المتميز - وفق سجل متابعة السلوك المتميز للفصل الدراسي 1447هـ
export interface DistinguishedItem {
  number: number;
  label: string;
  points: number;
}

export const DISTINGUISHED_ITEMS: DistinguishedItem[] = [
  { number: 1, label: "انضباط الطالب وعدم غيابه بدون عذر خلال الفصل الدراسي", points: 2 },
  { number: 2, label: "المشاركة في أنشطة مهارة إدارة الوقت", points: 4 },
  { number: 3, label: "تقديم مقترح لصالح المجتمع المدرسي", points: 2 },
  { number: 4, label: "الالتحاق ببرنامج أو دورة", points: 6 },
  { number: 5, label: "المشاركة في أنشطة المهارات الرقمية", points: 4 },
  { number: 6, label: "المشاركة في الخدمة المجتمعية خارج المدرسة", points: 6 },
  { number: 7, label: "المشاركة في أنشطة القيادة والمسؤولية", points: 4 },
  { number: 8, label: "كتابة رسالة شكر (للوطن، للقيادة الرشيدة، للمعلم...إلخ)", points: 2 },
  { number: 9, label: "تقديم فعالية حوارية", points: 6 },
  { number: 10, label: "المشاركة في حملة توعوية", points: 6 },
  { number: 11, label: "عرض تجارب شخصية ناجحة", points: 6 },
  { number: 12, label: "المشاركة في أنشطة مهارات الاتصال", points: 4 },
  { number: 13, label: "المشاركة في الإذاعة", points: 2 },
  { number: 14, label: "أخرى (بناءً على توصية لجنة التوجيه الطلابي - بحد أقصى 6 درجات)", points: 6 },
];

// عتبة العودة لقائمة السلوك الإيجابي
export const POSITIVE_RETURN_THRESHOLD = 10;

export interface DistinguishedRecord {
  id: string;
  student_id: string;
  student_name: string;
  student_number: string;
  grade: string;
  grade_code: string;
  section: number;
  item_number: number;
  item_label: string;
  points: number;
  description: string;
  evidence_url: string | null;
  evidence_note: string | null;
  execution_date: string;
  recorded_by: string | null;
  recorded_by_name: string;
  recorded_by_role: string;
  created_at: string;
  updated_at: string;
}
