export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string
          actor_role: string
          created_at: string
          details: Json
          entity_id: string
          entity_type: string
          id: string
          section: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string
          actor_role?: string
          created_at?: string
          details?: Json
          entity_id?: string
          entity_type?: string
          id?: string
          section?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string
          actor_role?: string
          created_at?: string
          details?: Json
          entity_id?: string
          entity_type?: string
          id?: string
          section?: string
        }
        Relationships: []
      }
      distinguished_behavior_records: {
        Row: {
          created_at: string
          description: string
          evidence_note: string | null
          evidence_url: string | null
          execution_date: string
          grade: string
          grade_code: string
          id: string
          item_label: string
          item_number: number
          points: number
          recorded_by: string | null
          recorded_by_name: string
          recorded_by_role: string
          section: number
          student_id: string
          student_name: string
          student_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          evidence_note?: string | null
          evidence_url?: string | null
          execution_date: string
          grade: string
          grade_code?: string
          id?: string
          item_label: string
          item_number: number
          points?: number
          recorded_by?: string | null
          recorded_by_name?: string
          recorded_by_role?: string
          section?: number
          student_id: string
          student_name: string
          student_number?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          evidence_note?: string | null
          evidence_url?: string | null
          execution_date?: string
          grade?: string
          grade_code?: string
          id?: string
          item_label?: string
          item_number?: number
          points?: number
          recorded_by?: string | null
          recorded_by_name?: string
          recorded_by_role?: string
          section?: number
          student_id?: string
          student_name?: string
          student_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      haduri_daily_records: {
        Row: {
          absence_type: string
          created_at: string
          created_by: string | null
          created_by_name: string
          day_name: string
          excuse_min: number
          excuse_period: string
          fares_upload_status: string
          greg_date: string
          hijri_date: string
          id: string
          in_time: string
          late_min: number
          month_key: string
          month_label: string
          out_time: string
          raw: Json
          source_file: string
          specialization: string
          status: string
          teacher_civil_id: string
          teacher_name: string
          teacher_phone: string
          updated_at: string
          work_min: number
        }
        Insert: {
          absence_type?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          day_name?: string
          excuse_min?: number
          excuse_period?: string
          fares_upload_status?: string
          greg_date?: string
          hijri_date?: string
          id?: string
          in_time?: string
          late_min?: number
          month_key?: string
          month_label?: string
          out_time?: string
          raw?: Json
          source_file?: string
          specialization?: string
          status?: string
          teacher_civil_id?: string
          teacher_name?: string
          teacher_phone?: string
          updated_at?: string
          work_min?: number
        }
        Update: {
          absence_type?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          day_name?: string
          excuse_min?: number
          excuse_period?: string
          fares_upload_status?: string
          greg_date?: string
          hijri_date?: string
          id?: string
          in_time?: string
          late_min?: number
          month_key?: string
          month_label?: string
          out_time?: string
          raw?: Json
          source_file?: string
          specialization?: string
          status?: string
          teacher_civil_id?: string
          teacher_name?: string
          teacher_phone?: string
          updated_at?: string
          work_min?: number
        }
        Relationships: []
      }
      haduri_monthly_attendance: {
        Row: {
          absent_days: number
          created_at: string
          created_by: string | null
          created_by_name: string
          excuse_min: number
          id: string
          imported_dates: Json
          late_min: number
          month_key: string
          month_label: string
          open_days: number
          present_days: number
          raw: Json
          source_files: Json
          specialization: string
          teacher_civil_id: string
          teacher_key: string
          teacher_name: string
          teacher_phone: string
          total_days: number
          updated_at: string
          work_min: number
        }
        Insert: {
          absent_days?: number
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          excuse_min?: number
          id?: string
          imported_dates?: Json
          late_min?: number
          month_key?: string
          month_label?: string
          open_days?: number
          present_days?: number
          raw?: Json
          source_files?: Json
          specialization?: string
          teacher_civil_id?: string
          teacher_key?: string
          teacher_name?: string
          teacher_phone?: string
          total_days?: number
          updated_at?: string
          work_min?: number
        }
        Update: {
          absent_days?: number
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          excuse_min?: number
          id?: string
          imported_dates?: Json
          late_min?: number
          month_key?: string
          month_label?: string
          open_days?: number
          present_days?: number
          raw?: Json
          source_files?: Json
          specialization?: string
          teacher_civil_id?: string
          teacher_key?: string
          teacher_name?: string
          teacher_phone?: string
          total_days?: number
          updated_at?: string
          work_min?: number
        }
        Relationships: []
      }
      health_awareness_programs: {
        Row: {
          beneficiaries_count: number
          created_at: string
          hijri_date: string
          id: string
          notes: string
          objectives: string
          outcomes: string
          partner_entity: string
          presenter: string
          program_date: string
          program_name: string
          program_type: string
          recorded_by: string | null
          recorded_by_name: string
          recorded_by_role: string
          target_audience: string
          updated_at: string
        }
        Insert: {
          beneficiaries_count?: number
          created_at?: string
          hijri_date?: string
          id?: string
          notes?: string
          objectives?: string
          outcomes?: string
          partner_entity?: string
          presenter?: string
          program_date?: string
          program_name?: string
          program_type?: string
          recorded_by?: string | null
          recorded_by_name?: string
          recorded_by_role?: string
          target_audience?: string
          updated_at?: string
        }
        Update: {
          beneficiaries_count?: number
          created_at?: string
          hijri_date?: string
          id?: string
          notes?: string
          objectives?: string
          outcomes?: string
          partner_entity?: string
          presenter?: string
          program_date?: string
          program_name?: string
          program_type?: string
          recorded_by?: string | null
          recorded_by_name?: string
          recorded_by_role?: string
          target_audience?: string
          updated_at?: string
        }
        Relationships: []
      }
      health_guardian_contacts: {
        Row: {
          action_taken: string
          contact_date: string
          contact_method: string
          contacted_by: string | null
          contacted_by_name: string
          contacted_by_role: string
          created_at: string
          grade: string
          grade_code: string
          guardian_response: string
          health_reason: string
          id: string
          message_summary: string
          section: number
          student_id: string
          student_name: string
          student_number: string
          updated_at: string
        }
        Insert: {
          action_taken?: string
          contact_date?: string
          contact_method?: string
          contacted_by?: string | null
          contacted_by_name?: string
          contacted_by_role?: string
          created_at?: string
          grade?: string
          grade_code?: string
          guardian_response?: string
          health_reason?: string
          id?: string
          message_summary?: string
          section?: number
          student_id: string
          student_name: string
          student_number?: string
          updated_at?: string
        }
        Update: {
          action_taken?: string
          contact_date?: string
          contact_method?: string
          contacted_by?: string | null
          contacted_by_name?: string
          contacted_by_role?: string
          created_at?: string
          grade?: string
          grade_code?: string
          guardian_response?: string
          health_reason?: string
          id?: string
          message_summary?: string
          section?: number
          student_id?: string
          student_name?: string
          student_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          created_at: string
          id: string
          message_text: string
          message_type: string
          read_at: string | null
          recipient_id: string
          recipient_name: string
          replied_at: string | null
          reply_text: string | null
          sender_id: string
          sender_name: string
          sender_role: string
          status: string
          student_grade: string | null
          student_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message_text: string
          message_type?: string
          read_at?: string | null
          recipient_id: string
          recipient_name: string
          replied_at?: string | null
          reply_text?: string | null
          sender_id: string
          sender_name: string
          sender_role?: string
          status?: string
          student_grade?: string | null
          student_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message_text?: string
          message_type?: string
          read_at?: string | null
          recipient_id?: string
          recipient_name?: string
          replied_at?: string | null
          reply_text?: string | null
          sender_id?: string
          sender_name?: string
          sender_role?: string
          status?: string
          student_grade?: string | null
          student_name?: string | null
        }
        Relationships: []
      }
      note_cancel_requests: {
        Row: {
          action_date: string
          action_id: string
          action_type: string
          created_at: string
          grade: string
          id: string
          reason: string
          requested_by: string
          requested_by_name: string
          requested_by_role: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          section: number
          status: string
          student_id: string
          student_name: string
        }
        Insert: {
          action_date: string
          action_id: string
          action_type: string
          created_at?: string
          grade: string
          id?: string
          reason: string
          requested_by: string
          requested_by_name: string
          requested_by_role?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          section: number
          status?: string
          student_id: string
          student_name: string
        }
        Update: {
          action_date?: string
          action_id?: string
          action_type?: string
          created_at?: string
          grade?: string
          id?: string
          reason?: string
          requested_by?: string
          requested_by_name?: string
          requested_by_role?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          section?: number
          status?: string
          student_id?: string
          student_name?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          is_read: boolean
          related_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          related_id?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          related_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approved: boolean
          approved_by: string | null
          created_at: string
          full_name: string
          id: string
          is_principal: boolean
          national_id: string
          phone: string
          role_title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved?: boolean
          approved_by?: string | null
          created_at?: string
          full_name: string
          id?: string
          is_principal?: boolean
          national_id: string
          phone: string
          role_title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved?: boolean
          approved_by?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_principal?: boolean
          national_id?: string
          phone?: string
          role_title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      school_environment_health_log: {
        Row: {
          action_taken: string
          created_at: string
          hijri_date: string
          id: string
          inspection_date: string
          inspection_type: string
          location: string
          observations: string
          recorded_by: string | null
          recorded_by_name: string
          recorded_by_role: string
          responsible_person: string
          risk_level: string
          status: string
          updated_at: string
        }
        Insert: {
          action_taken?: string
          created_at?: string
          hijri_date?: string
          id?: string
          inspection_date?: string
          inspection_type?: string
          location?: string
          observations?: string
          recorded_by?: string | null
          recorded_by_name?: string
          recorded_by_role?: string
          responsible_person?: string
          risk_level?: string
          status?: string
          updated_at?: string
        }
        Update: {
          action_taken?: string
          created_at?: string
          hijri_date?: string
          id?: string
          inspection_date?: string
          inspection_type?: string
          location?: string
          observations?: string
          recorded_by?: string | null
          recorded_by_name?: string
          recorded_by_role?: string
          responsible_person?: string
          risk_level?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      school_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      sms_sent_log: {
        Row: {
          created_at: string
          id: string
          sent_by: string | null
          sent_date: string
          sms_type: string
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          sent_by?: string | null
          sent_date: string
          sms_type: string
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          sent_by?: string | null
          sent_date?: string
          sms_type?: string
          student_id?: string
        }
        Relationships: []
      }
      student_actions: {
        Row: {
          created_at: string
          date: string
          details: string | null
          grade: string
          grade_code: string
          id: string
          performed_by: string | null
          performed_by_name: string | null
          performed_by_role: string | null
          period: number | null
          section: number
          student_id: string
          student_name: string
          student_number: string
          subject_name: string | null
          time: string
          type: string
        }
        Insert: {
          created_at?: string
          date: string
          details?: string | null
          grade: string
          grade_code: string
          id?: string
          performed_by?: string | null
          performed_by_name?: string | null
          performed_by_role?: string | null
          period?: number | null
          section: number
          student_id: string
          student_name: string
          student_number: string
          subject_name?: string | null
          time: string
          type: string
        }
        Update: {
          created_at?: string
          date?: string
          details?: string | null
          grade?: string
          grade_code?: string
          id?: string
          performed_by?: string | null
          performed_by_name?: string | null
          performed_by_role?: string | null
          period?: number | null
          section?: number
          student_id?: string
          student_name?: string
          student_number?: string
          subject_name?: string | null
          time?: string
          type?: string
        }
        Relationships: []
      }
      student_health_records: {
        Row: {
          condition_type: string
          created_at: string
          description: string
          emergency_contact: string
          grade: string
          grade_code: string
          id: string
          medications: string
          recorded_by: string | null
          recorded_by_name: string
          recorded_by_role: string
          section: number
          severity: string
          student_id: string
          student_name: string
          student_number: string
          updated_at: string
        }
        Insert: {
          condition_type?: string
          created_at?: string
          description?: string
          emergency_contact?: string
          grade?: string
          grade_code?: string
          id?: string
          medications?: string
          recorded_by?: string | null
          recorded_by_name?: string
          recorded_by_role?: string
          section?: number
          severity?: string
          student_id: string
          student_name: string
          student_number?: string
          updated_at?: string
        }
        Update: {
          condition_type?: string
          created_at?: string
          description?: string
          emergency_contact?: string
          grade?: string
          grade_code?: string
          id?: string
          medications?: string
          recorded_by?: string | null
          recorded_by_name?: string
          recorded_by_role?: string
          section?: number
          severity?: string
          student_id?: string
          student_name?: string
          student_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_health_referrals: {
        Row: {
          attachments: string
          created_at: string
          diagnosis: string
          follow_up_result: string
          grade: string
          grade_code: string
          id: string
          reason: string
          recorded_by: string | null
          recorded_by_name: string
          recorded_by_role: string
          referral_date: string
          referral_type: string
          referred_to: string
          section: number
          status: string
          student_id: string
          student_name: string
          student_number: string
          updated_at: string
        }
        Insert: {
          attachments?: string
          created_at?: string
          diagnosis?: string
          follow_up_result?: string
          grade?: string
          grade_code?: string
          id?: string
          reason?: string
          recorded_by?: string | null
          recorded_by_name?: string
          recorded_by_role?: string
          referral_date?: string
          referral_type?: string
          referred_to?: string
          section?: number
          status?: string
          student_id: string
          student_name: string
          student_number?: string
          updated_at?: string
        }
        Update: {
          attachments?: string
          created_at?: string
          diagnosis?: string
          follow_up_result?: string
          grade?: string
          grade_code?: string
          id?: string
          reason?: string
          recorded_by?: string | null
          recorded_by_name?: string
          recorded_by_role?: string
          referral_date?: string
          referral_type?: string
          referred_to?: string
          section?: number
          status?: string
          student_id?: string
          student_name?: string
          student_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_health_services: {
        Row: {
          action_taken: string
          created_at: string
          description: string
          follow_up: string
          grade: string
          grade_code: string
          guardian_notified: boolean
          id: string
          recorded_by: string | null
          recorded_by_name: string
          recorded_by_role: string
          related_condition: string
          section: number
          service_date: string
          service_type: string
          student_id: string
          student_name: string
          student_number: string
          updated_at: string
        }
        Insert: {
          action_taken?: string
          created_at?: string
          description?: string
          follow_up?: string
          grade?: string
          grade_code?: string
          guardian_notified?: boolean
          id?: string
          recorded_by?: string | null
          recorded_by_name?: string
          recorded_by_role?: string
          related_condition?: string
          section?: number
          service_date?: string
          service_type?: string
          student_id: string
          student_name: string
          student_number?: string
          updated_at?: string
        }
        Update: {
          action_taken?: string
          created_at?: string
          description?: string
          follow_up?: string
          grade?: string
          grade_code?: string
          guardian_notified?: boolean
          id?: string
          recorded_by?: string | null
          recorded_by_name?: string
          recorded_by_role?: string
          related_condition?: string
          section?: number
          service_date?: string
          service_type?: string
          student_id?: string
          student_name?: string
          student_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_medical_absences: {
        Row: {
          created_at: string
          days_count: number
          diagnosis: string
          end_date: string
          excused: boolean
          grade: string
          grade_code: string
          id: string
          medical_report_provided: boolean
          notes: string
          recorded_by: string | null
          recorded_by_name: string
          recorded_by_role: string
          report_source: string
          section: number
          start_date: string
          student_id: string
          student_name: string
          student_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          days_count?: number
          diagnosis?: string
          end_date?: string
          excused?: boolean
          grade?: string
          grade_code?: string
          id?: string
          medical_report_provided?: boolean
          notes?: string
          recorded_by?: string | null
          recorded_by_name?: string
          recorded_by_role?: string
          report_source?: string
          section?: number
          start_date?: string
          student_id: string
          student_name: string
          student_number?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          days_count?: number
          diagnosis?: string
          end_date?: string
          excused?: boolean
          grade?: string
          grade_code?: string
          id?: string
          medical_report_provided?: boolean
          notes?: string
          recorded_by?: string | null
          recorded_by_name?: string
          recorded_by_role?: string
          report_source?: string
          section?: number
          start_date?: string
          student_id?: string
          student_name?: string
          student_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_referrals: {
        Row: {
          case_type: string
          counselor_action: string | null
          counselor_followup_notes: string | null
          counselor_followup_recommendation: string | null
          counselor_notes: string | null
          counselor_recommendation: string | null
          created_at: string
          grade: string
          grade_code: string
          id: string
          period: number | null
          previous_actions: string
          referral_date: string
          referral_reason: string
          referral_type: string
          referred_by: string | null
          referred_by_name: string
          referred_to_name: string
          registrar_action: string | null
          registrar_date: string | null
          repetition_count: number
          section: number
          status: string
          student_id: string
          student_name: string
          student_number: string
          updated_at: string
          vice_action: string | null
          vice_deduction_amount: string | null
          vice_deduction_type: string | null
        }
        Insert: {
          case_type: string
          counselor_action?: string | null
          counselor_followup_notes?: string | null
          counselor_followup_recommendation?: string | null
          counselor_notes?: string | null
          counselor_recommendation?: string | null
          created_at?: string
          grade: string
          grade_code?: string
          id?: string
          period?: number | null
          previous_actions?: string
          referral_date: string
          referral_reason?: string
          referral_type?: string
          referred_by?: string | null
          referred_by_name?: string
          referred_to_name?: string
          registrar_action?: string | null
          registrar_date?: string | null
          repetition_count?: number
          section?: number
          status?: string
          student_id: string
          student_name: string
          student_number?: string
          updated_at?: string
          vice_action?: string | null
          vice_deduction_amount?: string | null
          vice_deduction_type?: string | null
        }
        Update: {
          case_type?: string
          counselor_action?: string | null
          counselor_followup_notes?: string | null
          counselor_followup_recommendation?: string | null
          counselor_notes?: string | null
          counselor_recommendation?: string | null
          created_at?: string
          grade?: string
          grade_code?: string
          id?: string
          period?: number | null
          previous_actions?: string
          referral_date?: string
          referral_reason?: string
          referral_type?: string
          referred_by?: string | null
          referred_by_name?: string
          referred_to_name?: string
          registrar_action?: string | null
          registrar_date?: string | null
          repetition_count?: number
          section?: number
          status?: string
          student_id?: string
          student_name?: string
          student_number?: string
          updated_at?: string
          vice_action?: string | null
          vice_deduction_amount?: string | null
          vice_deduction_type?: string | null
        }
        Relationships: []
      }
      student_special_health_cases: {
        Row: {
          active: boolean
          case_category: string
          case_severity: string
          created_at: string
          description: string
          doctor_contact: string
          emergency_plan: string
          grade: string
          grade_code: string
          guardian_contact: string
          id: string
          medications: string
          recorded_by: string | null
          recorded_by_name: string
          recorded_by_role: string
          required_accommodations: string
          section: number
          student_id: string
          student_name: string
          student_number: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          case_category?: string
          case_severity?: string
          created_at?: string
          description?: string
          doctor_contact?: string
          emergency_plan?: string
          grade?: string
          grade_code?: string
          guardian_contact?: string
          id?: string
          medications?: string
          recorded_by?: string | null
          recorded_by_name?: string
          recorded_by_role?: string
          required_accommodations?: string
          section?: number
          student_id: string
          student_name: string
          student_number?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          case_category?: string
          case_severity?: string
          created_at?: string
          description?: string
          doctor_contact?: string
          emergency_plan?: string
          grade?: string
          grade_code?: string
          guardian_contact?: string
          id?: string
          medications?: string
          recorded_by?: string | null
          recorded_by_name?: string
          recorded_by_role?: string
          required_accommodations?: string
          section?: number
          student_id?: string
          student_name?: string
          student_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_vital_signs: {
        Row: {
          academic_year: string
          bmi: number | null
          created_at: string
          diastolic_bp: number | null
          grade: string
          grade_code: string
          height_cm: number | null
          id: string
          notes: string
          recorded_by: string | null
          recorded_by_name: string
          recorded_by_role: string
          section: number
          student_id: string
          student_name: string
          student_number: string
          systolic_bp: number | null
          term: number
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          academic_year?: string
          bmi?: number | null
          created_at?: string
          diastolic_bp?: number | null
          grade?: string
          grade_code?: string
          height_cm?: number | null
          id?: string
          notes?: string
          recorded_by?: string | null
          recorded_by_name?: string
          recorded_by_role?: string
          section?: number
          student_id: string
          student_name: string
          student_number?: string
          systolic_bp?: number | null
          term?: number
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          academic_year?: string
          bmi?: number | null
          created_at?: string
          diastolic_bp?: number | null
          grade?: string
          grade_code?: string
          height_cm?: number | null
          id?: string
          notes?: string
          recorded_by?: string | null
          recorded_by_name?: string
          recorded_by_role?: string
          section?: number
          student_id?: string
          student_name?: string
          student_number?: string
          systolic_bp?: number | null
          term?: number
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      students: {
        Row: {
          created_at: string
          grade: string
          grade_code: string
          guardian_phone: string
          id: string
          name: string
          section: number
          student_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          grade: string
          grade_code: string
          guardian_phone?: string
          id?: string
          name: string
          section: number
          student_number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          grade?: string
          grade_code?: string
          guardian_phone?: string
          id?: string
          name?: string
          section?: number
          student_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      teacher_legacy_archive: {
        Row: {
          action_type: string
          created_at: string
          created_by: string | null
          created_by_name: string
          greg_date: string
          hijri_date: string
          id: string
          month_label: string
          payload: Json
          report_type: string
          source: string
          summary: string
          teacher_civil_id: string
          teacher_name: string
          teacher_phone: string
        }
        Insert: {
          action_type?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          greg_date?: string
          hijri_date?: string
          id?: string
          month_label?: string
          payload?: Json
          report_type?: string
          source: string
          summary?: string
          teacher_civil_id?: string
          teacher_name?: string
          teacher_phone?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          greg_date?: string
          hijri_date?: string
          id?: string
          month_label?: string
          payload?: Json
          report_type?: string
          source?: string
          summary?: string
          teacher_civil_id?: string
          teacher_name?: string
          teacher_phone?: string
        }
        Relationships: []
      }
      teacher_notices: {
        Row: {
          abs_from_time: string
          abs_to_time: string
          abs_total_min: number
          created_at: string
          created_by: string | null
          created_by_name: string
          day_name: string
          greg_date: string
          hijri_date: string
          id: string
          late_in_time: string
          late_total_min: number
          lesson_class: string
          lesson_minutes: number
          lesson_period: string
          note_reason: string
          notice_kind: string
          season_mode: string
          serial_number: number
          shift_extended: boolean
          teacher_civil_id: string
          teacher_id: string | null
          teacher_name: string
          teacher_phone: string
        }
        Insert: {
          abs_from_time?: string
          abs_to_time?: string
          abs_total_min?: number
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          day_name?: string
          greg_date?: string
          hijri_date?: string
          id?: string
          late_in_time?: string
          late_total_min?: number
          lesson_class?: string
          lesson_minutes?: number
          lesson_period?: string
          note_reason?: string
          notice_kind: string
          season_mode?: string
          serial_number?: number
          shift_extended?: boolean
          teacher_civil_id?: string
          teacher_id?: string | null
          teacher_name: string
          teacher_phone?: string
        }
        Update: {
          abs_from_time?: string
          abs_to_time?: string
          abs_total_min?: number
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          day_name?: string
          greg_date?: string
          hijri_date?: string
          id?: string
          late_in_time?: string
          late_total_min?: number
          lesson_class?: string
          lesson_minutes?: number
          lesson_period?: string
          note_reason?: string
          notice_kind?: string
          season_mode?: string
          serial_number?: number
          shift_extended?: boolean
          teacher_civil_id?: string
          teacher_id?: string | null
          teacher_name?: string
          teacher_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_notices_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      teachers: {
        Row: {
          active: boolean
          civil_id: string
          created_at: string
          current_job: string
          full_name: string
          id: string
          job_number: string
          phone: string
          rank_title: string
          specialization: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          civil_id: string
          created_at?: string
          current_job?: string
          full_name: string
          id?: string
          job_number?: string
          phone?: string
          rank_title?: string
          specialization?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          civil_id?: string
          created_at?: string
          current_job?: string
          full_name?: string
          id?: string
          job_number?: string
          phone?: string
          rank_title?: string
          specialization?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          permission: Database["public"]["Enums"]["user_permission"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permission: Database["public"]["Enums"]["user_permission"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permission?: Database["public"]["Enums"]["user_permission"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_permission: {
        Args: {
          _perm: Database["public"]["Enums"]["user_permission"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved_user: { Args: { _user_id: string }; Returns: boolean }
      is_principal: { Args: { _user_id: string }; Returns: boolean }
      profile_self_update_allowed: {
        Args: {
          _new_approved: boolean
          _new_approved_by: string
          _new_is_principal: boolean
          _new_role_title: string
        }
        Returns: boolean
      }
    }
    Enums: {
      user_permission:
        | "record_late"
        | "record_absent"
        | "record_violation"
        | "record_permission"
        | "send_messages"
        | "add_students"
        | "edit_students"
        | "barcode_scan"
        | "print_subject_sheets"
        | "record_class_notes"
        | "entry_exit"
        | "manage_teacher_affairs"
        | "edit_actions"
        | "delete_actions"
        | "print_reports"
        | "send_sms"
        | "send_whatsapp"
        | "view_audit_log"
        | "view_archive"
        | "manage_archive"
        | "create_referral"
        | "manage_referrals"
        | "manage_distinguished"
        | "view_reports"
        | "import_teacher_files"
        | "print_teacher_certificates"
        | "import_schedule"
        | "manage_teacher_absence_type"
        | "view_teacher_profile"
        | "manage_fares_upload"
        | "view_health_affairs"
        | "record_health_records"
        | "edit_health_records"
        | "print_health_records"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      user_permission: [
        "record_late",
        "record_absent",
        "record_violation",
        "record_permission",
        "send_messages",
        "add_students",
        "edit_students",
        "barcode_scan",
        "print_subject_sheets",
        "record_class_notes",
        "entry_exit",
        "manage_teacher_affairs",
        "edit_actions",
        "delete_actions",
        "print_reports",
        "send_sms",
        "send_whatsapp",
        "view_audit_log",
        "view_archive",
        "manage_archive",
        "create_referral",
        "manage_referrals",
        "manage_distinguished",
        "view_reports",
        "import_teacher_files",
        "print_teacher_certificates",
        "import_schedule",
        "manage_teacher_absence_type",
        "view_teacher_profile",
        "manage_fares_upload",
        "view_health_affairs",
        "record_health_records",
        "edit_health_records",
        "print_health_records",
      ],
    },
  },
} as const
