import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, FileWarning, Folder, CalendarDays, Award } from "lucide-react";
import TeachersRegistry from "./TeachersRegistry";
import FaresAbsenceArchive from "./FaresAbsenceArchive";
import LegacyArchive from "./LegacyArchive";
import MonthlyArchiveBrowser from "./MonthlyArchiveBrowser";
import TeacherCertificatesTab from "./TeacherCertificatesTab";
import { Card } from "@/components/ui/card";

/**
 * فرع موحّد «الأرشيف والبيانات» يدمج:
 *  - سجل المعلمين
 *  - أرشيف الخطابات الرسمية
 *  - أرشيف الإجراءات الإدارية
 * كلها مرتبطة بقاعدة البيانات مباشرة.
 */
export default function TeacherArchiveAndData() {
  const [tab, setTab] = useState("registry");

  return (
    <Card className="p-4 md:p-5" dir="rtl">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-4">
          <TabsTrigger value="registry" className="gap-2">
            <Users className="h-4 w-4" /> سجل المعلمين
          </TabsTrigger>
          <TabsTrigger value="months" className="gap-2">
            <CalendarDays className="h-4 w-4" /> أرشيف الحضور والانصراف
          </TabsTrigger>
          <TabsTrigger value="fares" className="gap-2">
            <FileWarning className="h-4 w-4" /> أرشيف الغياب والرفع في فارس
          </TabsTrigger>
          <TabsTrigger value="actions" className="gap-2">
            <Folder className="h-4 w-4" /> أرشيف الإجراءات
          </TabsTrigger>
          <TabsTrigger value="certificates" className="gap-2">
            <Award className="h-4 w-4" /> شهادات شكر
          </TabsTrigger>
        </TabsList>

        <TabsContent value="registry" className="mt-0">
          <TeachersRegistry />
        </TabsContent>

        <TabsContent value="months" className="mt-0">
          <MonthlyArchiveBrowser />
        </TabsContent>

        <TabsContent value="fares" className="mt-0">
          <FaresAbsenceArchive />
        </TabsContent>

        <TabsContent value="actions" className="mt-0">
          <LegacyArchive />
        </TabsContent>

        <TabsContent value="certificates" className="mt-0">
          <TeacherCertificatesTab />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
