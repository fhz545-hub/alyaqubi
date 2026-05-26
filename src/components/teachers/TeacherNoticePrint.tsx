import { Card } from "@/components/ui/card";
import type { Teacher, TeacherNotice } from "@/utils/teachersApi";
import { fmtHM } from "@/utils/teacherShifts";

interface Props {
  data: TeacherNotice;
  teacher: Teacher;
  principalName: string;
}

export default function TeacherNoticePrint({ data, teacher, principalName }: Props) {
  const isLate = data.notice_kind === "late";
  const isAbsent = data.notice_kind === "absent";
  const isGaib = data.notice_kind === "gaib";
  const isNote = data.notice_kind === "note";
  const title = isLate ? "خطاب تنبيه — تأخر"
    : isAbsent ? "خطاب تنبيه — عدم تواجد"
    : isGaib ? "محضر مساءلة عن غياب"
    : "نموذج لفت نظر";

  return (
    <Card className="p-8 print:p-6 print:shadow-none print:border-0 bg-white" id="notice-print-area">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #notice-print-area, #notice-print-area * { visibility: visible; }
          #notice-print-area { position: absolute; left: 0; top: 0; width: 210mm; padding: 15mm; }
          @page { size: A4; margin: 0; }
          #notice-print-area .notice-info-table {
            border-collapse: separate !important;
            border-spacing: 0 !important;
            border: 1px solid #475569 !important;
            border-radius: 6px !important;
            overflow: hidden !important;
          }
          #notice-print-area .notice-info-table th {
            background: #0b7e88 !important;
            color: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            border-bottom: 1.5px solid #064e55 !important;
          }
          #notice-print-area .notice-info-table td {
            background: #f8fafc !important;
            -webkit-print-color-adjust: exact;
          }
        }
        #notice-print-area .notice-info-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          margin-bottom: 14px;
          border: 1px solid hsl(var(--border));
          border-radius: 8px;
          overflow: hidden;
          font-size: 12.5px;
        }
        #notice-print-area .notice-info-table th {
          padding: 9px 10px;
          text-align: center;
          font-weight: 800;
          font-size: 12px;
          background: linear-gradient(180deg, #0b7e88 0%, #0a6e78 100%);
          color: #fff;
          letter-spacing: 0.25px;
          border-bottom: 1.5px solid #064e55;
        }
        #notice-print-area .notice-info-table td {
          padding: 10px 10px;
          text-align: center;
          vertical-align: middle;
          background: #f8fafc;
          border-left: 1px solid #e2e8f0;
          font-size: 12.5px;
        }
        #notice-print-area .notice-info-table th + th,
        #notice-print-area .notice-info-table td + td {
          border-right: 1px solid #e2e8f0;
        }
        #notice-print-area .notice-info-table td.name-cell {
          font-weight: 900;
          color: #0b7e88;
          background: #ecfeff;
          font-size: 13px;
        }
      `}</style>

      {/* Header */}
      <div className="text-center border-b-2 border-primary pb-3 mb-4">
        <p className="text-xs">المملكة العربية السعودية - وزارة التعليم</p>
        <p className="text-sm font-bold">ثانوية اليعقوبي - مسارات</p>
        <div className="flex justify-between items-center mt-3 text-xs">
          <span>اليوم: <b>{data.day_name}</b></span>
          <span>التاريخ الهجري: <b>{data.hijri_date}</b></span>
          <span>التاريخ الميلادي: <b>{data.greg_date}</b></span>
        </div>
      </div>

      <h2 className="text-center text-xl font-bold mb-4">{title}</h2>

      {/* Teacher Info Table */}
      <table className="notice-info-table">
        <colgroup>
          <col style={{ width: "28%" }} />
          <col style={{ width: "20%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "18%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>الاسم</th>
            <th>التخصص</th>
            <th>المرتبة</th>
            <th>رقم الوظيفة</th>
            <th>العمل الحالي</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="name-cell">{teacher.full_name}</td>
            <td>{teacher.specialization || "—"}</td>
            <td>{teacher.rank_title || "—"}</td>
            <td style={{ fontFamily: "ui-monospace, monospace" }}>{teacher.job_number || "—"}</td>
            <td>{teacher.current_job || "—"}</td>
          </tr>
        </tbody>
      </table>

      {/* Body */}
      {(isLate || isAbsent) && (
        <div className="space-y-3 text-sm leading-loose">
          <p><b>المكرم المعلم: {teacher.full_name}</b> &nbsp; وفقه الله</p>
          <p><b>السلام عليكم ورحمة الله وبركاته، وبعد ،،،</b></p>
          <p>إنه في يوم <b>{data.day_name}</b> الموافق <b>{data.hijri_date}</b>:</p>
          {isLate && (
            <p className="pr-4">
              ☑ تأخركم من بداية العمل، وحضوركم الساعة (<b>{data.late_in_time}</b>).
              <br />
              <span className="text-warning text-xs">— إجمالي التأخر: {data.late_total_min} دقيقة ({fmtHM(data.late_total_min)} س)</span>
            </p>
          )}
          {isAbsent && (
            <p className="pr-4">
              ☑ عدم تواجدكم أثناء العمل من الساعة (<b>{data.abs_from_time}</b>) إلى الساعة (<b>{data.abs_to_time}</b>).
              <br />
              <span className="text-destructive text-xs">— مدة عدم التواجد: {data.abs_total_min} دقيقة ({fmtHM(data.abs_total_min)} س)</span>
            </p>
          )}
          <p>عليه نأمل توضيح أسباب ذلك مع إرفاق ما يؤيد عذركم، ولكم تحياتنا.</p>

          <div className="border-t pt-3 mt-4">
            <p><b>إفادة المعلم:</b> أُفيدكم بأن سبب {isLate ? "التأخر" : "عدم التواجد"} الموضّح أعلاه هو:</p>
            <div className="border-b border-dotted border-foreground/40 my-2 h-6"></div>
            <div className="border-b border-dotted border-foreground/40 my-2 h-6"></div>
            <p className="text-xs mt-3">
              <b>اسم المعلم:</b> {teacher.full_name} &nbsp;&nbsp;
              <b>التوقيع:</b> ____________ &nbsp;&nbsp;
              <b>التاريخ:</b> ____ / ____ / ____
            </p>
          </div>

          <div className="border-t pt-3 mt-4">
            <p><b>رأي مدير المدرسة:</b></p>
            <p className="pr-4">☐ تمّ تنبيه الموظف شفهيًا.</p>
            <p className="pr-4">☐ يُكتفى بهذا التنبيه مع المتابعة.</p>
            <p className="pr-4">☐ يُرفع لجهة الاختصاص عند تكرار المخالفة.</p>
          </div>
        </div>
      )}

      {isGaib && (
        <div className="space-y-3 text-sm leading-loose">
          <p>إنه في يوم <b>{data.day_name}</b> الموافق <b>{data.hijri_date}</b> تغيّب المعلم عن العمل.</p>
          <p><b>المكرم: {teacher.full_name}</b> وفقه الله</p>
          <p><b>السلام عليكم ورحمة الله وبركاته، وبعد ،،،</b></p>
          <p>من خلال متابعة سجل الدوام تبيّن غيابكم خلال الفترة المذكورة، آمل الإفادة عن سبب ذلك وتقديم ما يؤيد عذركم خلال أسبوع من تاريخه؛ علماً بأنه في حالة عدم الالتزام سيتم اتخاذ اللازم حسب التعليمات.</p>

          <div className="border-t pt-3 mt-4">
            <p><b>الإفادة (سطران):</b></p>
            <p>المكرم / مدير المدرسة وفقه الله</p>
            <p>أفيدكم أن غيابي كان للأسباب التالية:</p>
            <div className="border-b border-dotted border-foreground/40 my-2 h-6"></div>
            <div className="border-b border-dotted border-foreground/40 my-2 h-6"></div>
            <p className="text-xs mt-3">
              <b>اسم المعلم:</b> {teacher.full_name} &nbsp;&nbsp;
              <b>التوقيع:</b> ____________ &nbsp;&nbsp;
              <b>التاريخ:</b> ____ / ____ / ____
            </p>
          </div>

          <div className="border-t pt-3 mt-4">
            <p><b>قرار مدير المدرسة:</b></p>
            <p className="pr-4">☐ تُحتسب له إجازة مرضية بعد التأكد من نظامية التقرير.</p>
            <p className="pr-4">☐ يُحتسب من رصيد الإجازات الاضطرارية إن سمح الرصيد.</p>
            <p className="pr-4">☐ يُعتمد الحسم لعدم قبول العذر.</p>
          </div>
        </div>
      )}

      {isNote && (
        <div className="space-y-3 text-sm leading-loose">
          <p>الأستاذ الفاضل/ <b>{teacher.full_name}</b> حفظه الله</p>
          <p><b>السلام عليكم ورحمة الله وبركاته، وبعد ،،،</b></p>
          <p>في يوم <b>{data.day_name}</b> الموافق <b>{data.hijri_date}</b></p>
          <p>
            إشارةً إلى التعليمات والأنظمة المعتمدة في المدرسة؛ لوحِظ <b>{data.note_reason}</b>
            {data.lesson_class && (
              <span> (في فصل <b>{data.lesson_class}</b> — الحصة رقم <b>{data.lesson_period}</b>
              {data.lesson_minutes > 0 && <> — المدة: <b>{data.lesson_minutes}</b> دقيقة</>})</span>
            )}.
            ونأمل منكم المبادرة بمعالجة ذلك، والالتزام التام بما يُوكل إليكم من مهام؛ دعمًا للانضباط المهني.
          </p>
          <p className="text-xs mt-3">
            <b>اسم المعلم:</b> {teacher.full_name} &nbsp;&nbsp;
            <b>التوقيع:</b> ____________ &nbsp;&nbsp;
            <b>التاريخ:</b> ____ / ____ / ____
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="border-t-2 border-primary mt-8 pt-3 text-sm">
        <p>
          <b>مدير المدرسة:</b> {principalName} &nbsp;&nbsp;
          <b>التوقيع:</b> ____________________ &nbsp;&nbsp;
          <b>التاريخ:</b> ____ / ____ / ____
        </p>
      </div>
    </Card>
  );
}