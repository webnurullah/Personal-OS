// Generated from supabase/migrations — same shape as `supabase gen types typescript`.
// Regenerate after changing the schema (see the main README).
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: '13' };
  public: {
    Tables: {
      archive_items: {
        Row: {
          id: string;
          user_id: string;
          kind: string;
          title: string;
          detail: string;
          related: number;
          data: Json;
          deleted_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          kind: string;
          title: string;
          detail?: string;
          related?: number;
          data: Json;
          deleted_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          kind?: string;
          title?: string;
          detail?: string;
          related?: number;
          data?: Json;
          deleted_at?: string;
        };
        Relationships: [

        ];
      };
      bills: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          note: string;
          amount: number;
          budget_category_id: string | null;
          icon: string;
          due_date: string;
          repeats_monthly: boolean;
          paid_at: string | null;
          transaction_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          note?: string;
          amount: number;
          budget_category_id?: string | null;
          icon?: string;
          due_date: string;
          repeats_monthly?: boolean;
          paid_at?: string | null;
          transaction_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          note?: string;
          amount?: number;
          budget_category_id?: string | null;
          icon?: string;
          due_date?: string;
          repeats_monthly?: boolean;
          paid_at?: string | null;
          transaction_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bills_budget_category_id_fkey';
            columns: ['budget_category_id'];
            isOneToOne: false;
            referencedRelation: 'budget_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bills_transaction_id_fkey';
            columns: ['transaction_id'];
            isOneToOne: false;
            referencedRelation: 'transactions';
            referencedColumns: ['id'];
          },
        ];
      };
      budget_categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          color: string;
          icon: string;
          monthly_limit: number;
          is_savings: boolean;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          color?: string;
          icon?: string;
          monthly_limit?: number;
          is_savings?: boolean;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          color?: string;
          icon?: string;
          monthly_limit?: number;
          is_savings?: boolean;
          position?: number;
          created_at?: string;
        };
        Relationships: [

        ];
      };
      categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          color: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          color?: string;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          color?: string;
          position?: number;
          created_at?: string;
        };
        Relationships: [

        ];
      };
      course_topics: {
        Row: {
          id: string;
          user_id: string;
          course_id: string;
          unit_id: string;
          code: string;
          title: string;
          short_title: string;
          outcome: string;
          est_hours: number;
          planned_week: number | null;
          status: string;
          actual_hours: number;
          notes: string;
          position: number;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          course_id: string;
          unit_id: string;
          code: string;
          title: string;
          short_title?: string;
          outcome?: string;
          est_hours?: number;
          planned_week?: number | null;
          status?: string;
          actual_hours?: number;
          notes?: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          course_id?: string;
          unit_id?: string;
          code?: string;
          title?: string;
          short_title?: string;
          outcome?: string;
          est_hours?: number;
          planned_week?: number | null;
          status?: string;
          actual_hours?: number;
          notes?: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'course_topics_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'course_topics_unit_id_fkey';
            columns: ['unit_id'];
            isOneToOne: false;
            referencedRelation: 'course_units';
            referencedColumns: ['id'];
          },
        ];
      };
      course_units: {
        Row: {
          id: string;
          user_id: string;
          course_id: string;
          code: string;
          title: string;
          color: string;
          position: number;
        };
        Insert: {
          id?: string;
          user_id?: string;
          course_id: string;
          code: string;
          title?: string;
          color?: string;
          position?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          course_id?: string;
          code?: string;
          title?: string;
          color?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'course_units_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'courses';
            referencedColumns: ['id'];
          },
        ];
      };
      courses: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          subtitle: string;
          quote: string;
          start_date: string;
          target_date: string;
          weekly_plan: number[];
          color: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          title: string;
          subtitle?: string;
          quote?: string;
          start_date: string;
          target_date: string;
          weekly_plan?: number[];
          color?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          subtitle?: string;
          quote?: string;
          start_date?: string;
          target_date?: string;
          weekly_plan?: number[];
          color?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [

        ];
      };
      events: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          event_date: string;
          all_day: boolean;
          start_time: string | null;
          end_time: string | null;
          repeat: string;
          repeat_until: string | null;
          category_id: string | null;
          note: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          title: string;
          event_date: string;
          all_day?: boolean;
          start_time?: string | null;
          end_time?: string | null;
          repeat?: string;
          repeat_until?: string | null;
          category_id?: string | null;
          note?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          event_date?: string;
          all_day?: boolean;
          start_time?: string | null;
          end_time?: string | null;
          repeat?: string;
          repeat_until?: string | null;
          category_id?: string | null;
          note?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'events_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      goal_milestones: {
        Row: {
          id: string;
          user_id: string;
          goal_id: string;
          title: string;
          at_value: number | null;
          done: boolean;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          goal_id: string;
          title: string;
          at_value?: number | null;
          done?: boolean;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          goal_id?: string;
          title?: string;
          at_value?: number | null;
          done?: boolean;
          position?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'goal_milestones_goal_id_fkey';
            columns: ['goal_id'];
            isOneToOne: false;
            referencedRelation: 'goals';
            referencedColumns: ['id'];
          },
        ];
      };
      goals: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          category_id: string | null;
          icon: string;
          color: string;
          status: string;
          progress_mode: string;
          current_value: number;
          target_value: number;
          unit: string;
          deadline: string | null;
          note: string;
          completed_on: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          title: string;
          category_id?: string | null;
          icon?: string;
          color?: string;
          status?: string;
          progress_mode?: string;
          current_value?: number;
          target_value?: number;
          unit?: string;
          deadline?: string | null;
          note?: string;
          completed_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          category_id?: string | null;
          icon?: string;
          color?: string;
          status?: string;
          progress_mode?: string;
          current_value?: number;
          target_value?: number;
          unit?: string;
          deadline?: string | null;
          note?: string;
          completed_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'goals_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      habit_logs: {
        Row: {
          habit_id: string;
          user_id: string;
          log_date: string;
          created_at: string;
        };
        Insert: {
          habit_id: string;
          user_id?: string;
          log_date: string;
          created_at?: string;
        };
        Update: {
          habit_id?: string;
          user_id?: string;
          log_date?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'habit_logs_habit_id_fkey';
            columns: ['habit_id'];
            isOneToOne: false;
            referencedRelation: 'habits';
            referencedColumns: ['id'];
          },
        ];
      };
      habits: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          goal_text: string;
          icon: string;
          color: string;
          position: number;
          archived_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          goal_text?: string;
          icon?: string;
          color?: string;
          position?: number;
          archived_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          goal_text?: string;
          icon?: string;
          color?: string;
          position?: number;
          archived_at?: string | null;
          created_at?: string;
        };
        Relationships: [

        ];
      };
      health_logs: {
        Row: {
          user_id: string;
          log_date: string;
          steps: number | null;
          sleep_minutes: number | null;
          resting_hr: number | null;
          weight_kg: number | null;
          water_glasses: number;
          mood: number | null;
          updated_at: string;
        };
        Insert: {
          user_id?: string;
          log_date: string;
          steps?: number | null;
          sleep_minutes?: number | null;
          resting_hr?: number | null;
          weight_kg?: number | null;
          water_glasses?: number;
          mood?: number | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          log_date?: string;
          steps?: number | null;
          sleep_minutes?: number | null;
          resting_hr?: number | null;
          weight_kg?: number | null;
          water_glasses?: number;
          mood?: number | null;
          updated_at?: string;
        };
        Relationships: [

        ];
      };
      job_applications: {
        Row: {
          id: string;
          user_id: string;
          url: string;
          title: string;
          company: string;
          location: string;
          deadline: string | null;
          status: string;
          applied_on: string | null;
          summary: string;
          requirements: string[];
          skills: string[];
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          url?: string;
          title: string;
          company?: string;
          location?: string;
          deadline?: string | null;
          status?: string;
          applied_on?: string | null;
          summary?: string;
          requirements?: string[];
          skills?: string[];
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          url?: string;
          title?: string;
          company?: string;
          location?: string;
          deadline?: string | null;
          status?: string;
          applied_on?: string | null;
          summary?: string;
          requirements?: string[];
          skills?: string[];
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [

        ];
      };
      learning_resources: {
        Row: {
          id: string;
          user_id: string;
          course_id: string | null;
          unit_id: string | null;
          practice_project_id: string | null;
          kind: string;
          title: string;
          url: string;
          platform: string;
          provider: string;
          status: string;
          priority: string;
          est_hours: number;
          items_total: number;
          items_done: number;
          due_date: string | null;
          started_on: string | null;
          completed_on: string | null;
          cost: number;
          skills: string[];
          rating: number | null;
          takeaway: string;
          dropped_reason: string;
          notes: string;
          certificate_url: string;
          certificate_id: string;
          issued_on: string | null;
          expires_on: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          course_id?: string | null;
          unit_id?: string | null;
          practice_project_id?: string | null;
          kind?: string;
          title: string;
          url?: string;
          platform?: string;
          provider?: string;
          status?: string;
          priority?: string;
          est_hours?: number;
          items_total?: number;
          items_done?: number;
          due_date?: string | null;
          started_on?: string | null;
          completed_on?: string | null;
          cost?: number;
          skills?: string[];
          rating?: number | null;
          takeaway?: string;
          dropped_reason?: string;
          notes?: string;
          certificate_url?: string;
          certificate_id?: string;
          issued_on?: string | null;
          expires_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          course_id?: string | null;
          unit_id?: string | null;
          practice_project_id?: string | null;
          kind?: string;
          title?: string;
          url?: string;
          platform?: string;
          provider?: string;
          status?: string;
          priority?: string;
          est_hours?: number;
          items_total?: number;
          items_done?: number;
          due_date?: string | null;
          started_on?: string | null;
          completed_on?: string | null;
          cost?: number;
          skills?: string[];
          rating?: number | null;
          takeaway?: string;
          dropped_reason?: string;
          notes?: string;
          certificate_url?: string;
          certificate_id?: string;
          issued_on?: string | null;
          expires_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [

        ];
      };
      notes: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          body: string;
          tag: string;
          color: string;
          pinned: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          title: string;
          body?: string;
          tag?: string;
          color?: string;
          pinned?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          body?: string;
          tag?: string;
          color?: string;
          pinned?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [

        ];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          tagline: string;
          city: string;
          avatar_path: string | null;
          timezone: string;
          currency: string;
          week_start: number;
          time_format: string;
          hide_amounts: boolean;
          weekly_study_goal: number;
          step_goal: number;
          sleep_goal_minutes: number;
          water_goal: number;
          notify: Json;
          notifications_read_at: string | null;
          skills: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          tagline?: string;
          city?: string;
          avatar_path?: string | null;
          timezone?: string;
          currency?: string;
          week_start?: number;
          time_format?: string;
          hide_amounts?: boolean;
          weekly_study_goal?: number;
          step_goal?: number;
          sleep_goal_minutes?: number;
          water_goal?: number;
          notify?: Json;
          notifications_read_at?: string | null;
          skills?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          tagline?: string;
          city?: string;
          avatar_path?: string | null;
          timezone?: string;
          currency?: string;
          week_start?: number;
          time_format?: string;
          hide_amounts?: boolean;
          weekly_study_goal?: number;
          step_goal?: number;
          sleep_goal_minutes?: number;
          water_goal?: number;
          notify?: Json;
          notifications_read_at?: string | null;
          skills?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [

        ];
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          kind: string;
          status: string;
          color: string;
          client: string;
          goal: string;
          start_date: string | null;
          due_date: string | null;
          links: Json;
          notes: string;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          kind?: string;
          status?: string;
          color?: string;
          client?: string;
          goal?: string;
          start_date?: string | null;
          due_date?: string | null;
          links?: Json;
          notes?: string;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          kind?: string;
          status?: string;
          color?: string;
          client?: string;
          goal?: string;
          start_date?: string | null;
          due_date?: string | null;
          links?: Json;
          notes?: string;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [

        ];
      };
      reminders: {
        Row: {
          id: string;
          user_id: string;
          text: string;
          due_date: string | null;
          done: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          text: string;
          due_date?: string | null;
          done?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          text?: string;
          due_date?: string | null;
          done?: boolean;
          created_at?: string;
        };
        Relationships: [

        ];
      };
      study_blocks: {
        Row: {
          id: string;
          user_id: string;
          week_start: string;
          weekday: number;
          hours: number;
          activity: string;
          done: boolean;
          created_at: string;
          topic_id: string | null;
          resource_id: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          week_start: string;
          weekday: number;
          hours: number;
          activity: string;
          done?: boolean;
          created_at?: string;
          topic_id?: string | null;
          resource_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          week_start?: string;
          weekday?: number;
          hours?: number;
          activity?: string;
          done?: boolean;
          created_at?: string;
          topic_id?: string | null;
          resource_id?: string | null;
        };
        Relationships: [

        ];
      };
      study_weeks: {
        Row: {
          user_id: string;
          week_start: string;
          topic: string;
          goal_hours: number | null;
        };
        Insert: {
          user_id?: string;
          week_start: string;
          topic?: string;
          goal_hours?: number | null;
        };
        Update: {
          user_id?: string;
          week_start?: string;
          topic?: string;
          goal_hours?: number | null;
        };
        Relationships: [

        ];
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          category_id: string | null;
          project_id: string | null;
          due_date: string | null;
          end_date: string | null;
          priority: string;
          notes: string;
          done_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          title: string;
          category_id?: string | null;
          project_id?: string | null;
          due_date?: string | null;
          end_date?: string | null;
          priority?: string;
          notes?: string;
          done_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          category_id?: string | null;
          project_id?: string | null;
          due_date?: string | null;
          end_date?: string | null;
          priority?: string;
          notes?: string;
          done_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tasks_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tasks_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          amount: number;
          budget_category_id: string | null;
          description: string;
          note: string;
          method: string;
          tx_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          type: string;
          amount: number;
          budget_category_id?: string | null;
          description: string;
          note?: string;
          method?: string;
          tx_date: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: string;
          amount?: number;
          budget_category_id?: string | null;
          description?: string;
          note?: string;
          method?: string;
          tx_date?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'transactions_budget_category_id_fkey';
            columns: ['budget_category_id'];
            isOneToOne: false;
            referencedRelation: 'budget_categories';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      archive_delete: {
        Args: { p_kind: string; p_id: string };
        Returns: string;
      };
      archive_restore: {
        Args: { p_id: string };
        Returns: Json;
      };
      create_default_rows: {
        Args: { p_user: string };
        Returns: undefined;
      };
      delete_my_data: {
        Args: never;
        Returns: undefined;
      };
      ensure_profile: {
        Args: never;
        Returns: Database['public']['Tables']['profiles']['Row'];
      };
      load_sample_data: {
        Args: { p_today: string };
        Returns: undefined;
      };
      pay_bill: {
        Args: { p_bill_id: string; p_method: string; p_date: string };
        Returns: Database['public']['Tables']['transactions']['Row'];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
