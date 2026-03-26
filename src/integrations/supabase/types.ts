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
          actie: string | null
          gebruiker: string | null
          id: string
          nieuw_waarde: Json | null
          oud_waarde: Json | null
          record_id: string | null
          tabel: string | null
          tijdstip: string | null
        }
        Insert: {
          actie?: string | null
          gebruiker?: string | null
          id?: string
          nieuw_waarde?: Json | null
          oud_waarde?: Json | null
          record_id?: string | null
          tabel?: string | null
          tijdstip?: string | null
        }
        Update: {
          actie?: string | null
          gebruiker?: string | null
          id?: string
          nieuw_waarde?: Json | null
          oud_waarde?: Json | null
          record_id?: string | null
          tabel?: string | null
          tijdstip?: string | null
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          bv_id: string
          huidig_saldo: number | null
          iban: string | null
          id: string
          laatste_sync: string | null
          naam: string | null
        }
        Insert: {
          bv_id: string
          huidig_saldo?: number | null
          iban?: string | null
          id?: string
          laatste_sync?: string | null
          naam?: string | null
        }
        Update: {
          bv_id?: string
          huidig_saldo?: number | null
          iban?: string | null
          id?: string
          laatste_sync?: string | null
          naam?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_bv_id_fkey"
            columns: ["bv_id"]
            isOneToOne: false
            referencedRelation: "bv"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          bank_account_id: string | null
          bedrag: number | null
          bunq_id: string | null
          bv_id: string
          datum: string | null
          id: string
          laatste_sync: string | null
          omschrijving: string | null
          tegenpartij: string | null
        }
        Insert: {
          bank_account_id?: string | null
          bedrag?: number | null
          bunq_id?: string | null
          bv_id: string
          datum?: string | null
          id?: string
          laatste_sync?: string | null
          omschrijving?: string | null
          tegenpartij?: string | null
        }
        Update: {
          bank_account_id?: string | null
          bedrag?: number | null
          bunq_id?: string | null
          bv_id?: string
          datum?: string | null
          id?: string
          laatste_sync?: string | null
          omschrijving?: string | null
          tegenpartij?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_bv_id_fkey"
            columns: ["bv_id"]
            isOneToOne: false
            referencedRelation: "bv"
            referencedColumns: ["id"]
          },
        ]
      }
      buffers: {
        Row: {
          actief: boolean | null
          bedrag: number | null
          buffer_type: string | null
          bv_id: string | null
          id: string
          naam: string | null
          niveau: string | null
          prioriteit: number | null
        }
        Insert: {
          actief?: boolean | null
          bedrag?: number | null
          buffer_type?: string | null
          bv_id?: string | null
          id?: string
          naam?: string | null
          niveau?: string | null
          prioriteit?: number | null
        }
        Update: {
          actief?: boolean | null
          bedrag?: number | null
          buffer_type?: string | null
          bv_id?: string | null
          id?: string
          naam?: string | null
          niveau?: string | null
          prioriteit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "buffers_bv_id_fkey"
            columns: ["bv_id"]
            isOneToOne: false
            referencedRelation: "bv"
            referencedColumns: ["id"]
          },
        ]
      }
      bv: {
        Row: {
          actief: boolean | null
          drempel_bedrag: number | null
          exact_division_code: number | null
          id: string
          kleur: string | null
          naam: string
        }
        Insert: {
          actief?: boolean | null
          drempel_bedrag?: number | null
          exact_division_code?: number | null
          id?: string
          kleur?: string | null
          naam: string
        }
        Update: {
          actief?: boolean | null
          drempel_bedrag?: number | null
          exact_division_code?: number | null
          id?: string
          kleur?: string | null
          naam?: string
        }
        Relationships: []
      }
      cashflow_items: {
        Row: {
          bedrag: number | null
          bron: string | null
          bv_id: string
          categorie: string | null
          goedgekeurd_op: string | null
          id: string
          omschrijving: string | null
          ref_id: string | null
          ref_type: string | null
          status: string | null
          subcategorie: string | null
          tegenpartij: string | null
          type: string | null
          week: string | null
        }
        Insert: {
          bedrag?: number | null
          bron?: string | null
          bv_id: string
          categorie?: string | null
          goedgekeurd_op?: string | null
          id?: string
          omschrijving?: string | null
          ref_id?: string | null
          ref_type?: string | null
          status?: string | null
          subcategorie?: string | null
          tegenpartij?: string | null
          type?: string | null
          week?: string | null
        }
        Update: {
          bedrag?: number | null
          bron?: string | null
          bv_id?: string
          categorie?: string | null
          goedgekeurd_op?: string | null
          id?: string
          omschrijving?: string | null
          ref_id?: string | null
          ref_type?: string | null
          status?: string | null
          subcategorie?: string | null
          tegenpartij?: string | null
          type?: string | null
          week?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_items_bv_id_fkey"
            columns: ["bv_id"]
            isOneToOne: false
            referencedRelation: "bv"
            referencedColumns: ["id"]
          },
        ]
      }
      counterparties: {
        Row: {
          iban: string | null
          id: string
          naam: string
          type: string | null
        }
        Insert: {
          iban?: string | null
          id?: string
          naam: string
          type?: string | null
        }
        Update: {
          iban?: string | null
          id?: string
          naam?: string
          type?: string | null
        }
        Relationships: []
      }
      dividends: {
        Row: {
          aandeelhouder: string | null
          bedrag: number | null
          bv_id: string
          geplande_betaaldatum: string | null
          id: string
          status: string | null
        }
        Insert: {
          aandeelhouder?: string | null
          bedrag?: number | null
          bv_id: string
          geplande_betaaldatum?: string | null
          id?: string
          status?: string | null
        }
        Update: {
          aandeelhouder?: string | null
          bedrag?: number | null
          bv_id?: string
          geplande_betaaldatum?: string | null
          id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dividends_bv_id_fkey"
            columns: ["bv_id"]
            isOneToOne: false
            referencedRelation: "bv"
            referencedColumns: ["id"]
          },
        ]
      }
      exact_tokens: {
        Row: {
          access_token: string
          available_divisions: Json | null
          bv_id: string | null
          created_at: string | null
          division: number | null
          expires_at: string
          id: string
          refresh_token: string
          updated_at: string | null
        }
        Insert: {
          access_token: string
          available_divisions?: Json | null
          bv_id?: string | null
          created_at?: string | null
          division?: number | null
          expires_at: string
          id?: string
          refresh_token: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          available_divisions?: Json | null
          bv_id?: string | null
          created_at?: string | null
          division?: number | null
          expires_at?: string
          id?: string
          refresh_token?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exact_tokens_bv_id_fkey"
            columns: ["bv_id"]
            isOneToOne: false
            referencedRelation: "bv"
            referencedColumns: ["id"]
          },
        ]
      }
      forecasts: {
        Row: {
          bv_id: string
          closing_balance: number | null
          gegenereerd_op: string | null
          id: string
          inflow: number | null
          opening_balance: number | null
          outflow: number | null
          week: string | null
        }
        Insert: {
          bv_id: string
          closing_balance?: number | null
          gegenereerd_op?: string | null
          id?: string
          inflow?: number | null
          opening_balance?: number | null
          outflow?: number | null
          week?: string | null
        }
        Update: {
          bv_id?: string
          closing_balance?: number | null
          gegenereerd_op?: string | null
          id?: string
          inflow?: number | null
          opening_balance?: number | null
          outflow?: number | null
          week?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forecasts_bv_id_fkey"
            columns: ["bv_id"]
            isOneToOne: false
            referencedRelation: "bv"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          aangemaakt_in_exact: string | null
          bedrag: number
          boekingsdatum: string | null
          bron: string | null
          bv_id: string
          counterparty_id: string | null
          exact_id: string | null
          factuurnummer: string | null
          forecast_item_id: string | null
          id: string
          import_status: string | null
          imported_at: string | null
          laatste_sync: string | null
          status: string | null
          type: string | null
          vervaldatum: string | null
        }
        Insert: {
          aangemaakt_in_exact?: string | null
          bedrag: number
          boekingsdatum?: string | null
          bron?: string | null
          bv_id: string
          counterparty_id?: string | null
          exact_id?: string | null
          factuurnummer?: string | null
          forecast_item_id?: string | null
          id?: string
          import_status?: string | null
          imported_at?: string | null
          laatste_sync?: string | null
          status?: string | null
          type?: string | null
          vervaldatum?: string | null
        }
        Update: {
          aangemaakt_in_exact?: string | null
          bedrag?: number
          boekingsdatum?: string | null
          bron?: string | null
          bv_id?: string
          counterparty_id?: string | null
          exact_id?: string | null
          factuurnummer?: string | null
          forecast_item_id?: string | null
          id?: string
          import_status?: string | null
          imported_at?: string | null
          laatste_sync?: string | null
          status?: string | null
          type?: string | null
          vervaldatum?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_bv_id_fkey"
            columns: ["bv_id"]
            isOneToOne: false
            referencedRelation: "bv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_forecast_item_id_fkey"
            columns: ["forecast_item_id"]
            isOneToOne: false
            referencedRelation: "cashflow_items"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_payments: {
        Row: {
          betaaldatum: string | null
          hoofdsom: number | null
          id: string
          loan_id: string
          rente: number | null
          status: string | null
        }
        Insert: {
          betaaldatum?: string | null
          hoofdsom?: number | null
          id?: string
          loan_id: string
          rente?: number | null
          status?: string | null
        }
        Update: {
          betaaldatum?: string | null
          hoofdsom?: number | null
          id?: string
          loan_id?: string
          rente?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          aflossingsfrequentie: string | null
          bv_id: string
          einddatum: string | null
          hoofdsom: number | null
          id: string
          kredietverstrekker: string | null
          rente_percentage: number | null
          startdatum: string | null
        }
        Insert: {
          aflossingsfrequentie?: string | null
          bv_id: string
          einddatum?: string | null
          hoofdsom?: number | null
          id?: string
          kredietverstrekker?: string | null
          rente_percentage?: number | null
          startdatum?: string | null
        }
        Update: {
          aflossingsfrequentie?: string | null
          bv_id?: string
          einddatum?: string | null
          hoofdsom?: number | null
          id?: string
          kredietverstrekker?: string | null
          rente_percentage?: number | null
          startdatum?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loans_bv_id_fkey"
            columns: ["bv_id"]
            isOneToOne: false
            referencedRelation: "bv"
            referencedColumns: ["id"]
          },
        ]
      }
      mt_pipeline_items: {
        Row: {
          aangemaakt_door: string | null
          aangemaakt_op: string | null
          bedrag: number | null
          bv_id: string
          id: string
          kans_percentage: number | null
          opmerkingen: string | null
          projectnaam: string | null
          status: string | null
          verwachte_week: string | null
        }
        Insert: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string | null
          bedrag?: number | null
          bv_id: string
          id?: string
          kans_percentage?: number | null
          opmerkingen?: string | null
          projectnaam?: string | null
          status?: string | null
          verwachte_week?: string | null
        }
        Update: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string | null
          bedrag?: number | null
          bv_id?: string
          id?: string
          kans_percentage?: number | null
          opmerkingen?: string | null
          projectnaam?: string | null
          status?: string | null
          verwachte_week?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mt_pipeline_items_bv_id_fkey"
            columns: ["bv_id"]
            isOneToOne: false
            referencedRelation: "bv"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_run_items: {
        Row: {
          bedrag: number
          iban_begunstigde: string | null
          id: string
          invoice_id: string
          naam_begunstigde: string | null
          payment_run_id: string
        }
        Insert: {
          bedrag: number
          iban_begunstigde?: string | null
          id?: string
          invoice_id: string
          naam_begunstigde?: string | null
          payment_run_id: string
        }
        Update: {
          bedrag?: number
          iban_begunstigde?: string | null
          id?: string
          invoice_id?: string
          naam_begunstigde?: string | null
          payment_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_run_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_run_items_payment_run_id_fkey"
            columns: ["payment_run_id"]
            isOneToOne: false
            referencedRelation: "payment_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_runs: {
        Row: {
          aangemaakt_op: string | null
          aantal_facturen: number | null
          bv_id: string | null
          id: string
          naam: string | null
          status: string
          totaal_bedrag: number | null
          uitgevoerd_op: string | null
        }
        Insert: {
          aangemaakt_op?: string | null
          aantal_facturen?: number | null
          bv_id?: string | null
          id?: string
          naam?: string | null
          status?: string
          totaal_bedrag?: number | null
          uitgevoerd_op?: string | null
        }
        Update: {
          aangemaakt_op?: string | null
          aantal_facturen?: number | null
          bv_id?: string | null
          id?: string
          naam?: string | null
          status?: string
          totaal_bedrag?: number | null
          uitgevoerd_op?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_runs_bv_id_fkey"
            columns: ["bv_id"]
            isOneToOne: false
            referencedRelation: "bv"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_rules: {
        Row: {
          actief: boolean | null
          bedrag: number | null
          bron: string | null
          bv_id: string
          categorie: string | null
          counterparty_id: string | null
          einddatum: string | null
          frequentie: string | null
          id: string
          omschrijving: string | null
          startdatum: string | null
          verwachte_betaaldag: number | null
        }
        Insert: {
          actief?: boolean | null
          bedrag?: number | null
          bron?: string | null
          bv_id: string
          categorie?: string | null
          counterparty_id?: string | null
          einddatum?: string | null
          frequentie?: string | null
          id?: string
          omschrijving?: string | null
          startdatum?: string | null
          verwachte_betaaldag?: number | null
        }
        Update: {
          actief?: boolean | null
          bedrag?: number | null
          bron?: string | null
          bv_id?: string
          categorie?: string | null
          counterparty_id?: string | null
          einddatum?: string | null
          frequentie?: string | null
          id?: string
          omschrijving?: string | null
          startdatum?: string | null
          verwachte_betaaldag?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_rules_bv_id_fkey"
            columns: ["bv_id"]
            isOneToOne: false
            referencedRelation: "bv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_rules_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string
          role: string
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id: string
          role?: string
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          role?: string
        }
        Relationships: []
      }
      vat_positions: {
        Row: {
          bv_id: string
          id: string
          netto_btw: number | null
          periode_label: string | null
          status: string | null
          te_vorderen_btw: number | null
          verschuldigd_btw: number | null
        }
        Insert: {
          bv_id: string
          id?: string
          netto_btw?: number | null
          periode_label?: string | null
          status?: string | null
          te_vorderen_btw?: number | null
          verschuldigd_btw?: number | null
        }
        Update: {
          bv_id?: string
          id?: string
          netto_btw?: number | null
          periode_label?: string | null
          status?: string | null
          te_vorderen_btw?: number | null
          verschuldigd_btw?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vat_positions_bv_id_fkey"
            columns: ["bv_id"]
            isOneToOne: false
            referencedRelation: "bv"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
