CREATE TABLE "guild_audit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"kind" text NOT NULL,
	"actor_user_id" text,
	"target_user_id" text,
	"riot_account_id" uuid,
	"previous_primary_account_id" uuid,
	"next_primary_account_id" uuid,
	"previous_primary_was_set" boolean DEFAULT false NOT NULL,
	"next_primary_was_set" boolean DEFAULT false NOT NULL,
	"setting_key" text,
	"previous_setting_id" text,
	"next_setting_id" text,
	"previous_setting_name" text,
	"next_setting_name" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_audit_entries_kind_valid" CHECK ("guild_audit_entries"."kind" in ('riot_account_linked', 'riot_account_unlinked', 'riot_account_primary_changed', 'discord_setting_changed')),
	CONSTRAINT "guild_audit_entries_setting_valid" CHECK (("guild_audit_entries"."kind" = 'discord_setting_changed' and "guild_audit_entries"."setting_key" is not null and "guild_audit_entries"."setting_key" in ('operatorRoleId', 'recruitmentChannelId', 'entryChannelId', 'resultChannelId')) or ("guild_audit_entries"."kind" <> 'discord_setting_changed' and "guild_audit_entries"."setting_key" is null)),
	CONSTRAINT "guild_audit_entries_primary_presence" CHECK (("guild_audit_entries"."previous_primary_was_set" or "guild_audit_entries"."previous_primary_account_id" is null) and ("guild_audit_entries"."next_primary_was_set" or "guild_audit_entries"."next_primary_account_id" is null))
);
--> statement-breakpoint
ALTER TABLE "guild_audit_entries" ADD CONSTRAINT "guild_audit_entries_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_audit_entries" ADD CONSTRAINT "guild_audit_entries_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_audit_entries" ADD CONSTRAINT "guild_audit_entries_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_audit_entries" ADD CONSTRAINT "guild_audit_entries_riot_account_id_riot_accounts_id_fk" FOREIGN KEY ("riot_account_id") REFERENCES "public"."riot_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_audit_entries" ADD CONSTRAINT "guild_audit_entries_previous_primary_account_id_riot_accounts_id_fk" FOREIGN KEY ("previous_primary_account_id") REFERENCES "public"."riot_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_audit_entries" ADD CONSTRAINT "guild_audit_entries_next_primary_account_id_riot_accounts_id_fk" FOREIGN KEY ("next_primary_account_id") REFERENCES "public"."riot_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guild_audit_entries_recent_idx" ON "guild_audit_entries" USING btree ("guild_id","created_at","id");--> statement-breakpoint
CREATE INDEX "guild_audit_entries_actor_idx" ON "guild_audit_entries" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "guild_audit_entries_target_idx" ON "guild_audit_entries" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "guild_audit_entries_account_idx" ON "guild_audit_entries" USING btree ("riot_account_id");--> statement-breakpoint
CREATE INDEX "guild_audit_entries_previous_primary_idx" ON "guild_audit_entries" USING btree ("previous_primary_account_id");--> statement-breakpoint
CREATE INDEX "guild_audit_entries_next_primary_idx" ON "guild_audit_entries" USING btree ("next_primary_account_id");