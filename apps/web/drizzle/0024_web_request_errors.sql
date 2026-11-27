CREATE TABLE "web_request_errors" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"occurred_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"guild_id" text,
	"method" text NOT NULL,
	"route" text,
	"status" integer NOT NULL,
	"kind" text
);
--> statement-breakpoint
ALTER TABLE "web_request_errors" ADD CONSTRAINT "web_request_errors_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "web_request_errors_guild_time_idx" ON "web_request_errors" USING btree ("guild_id","occurred_at" DESC NULLS LAST,"request_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "web_request_errors_time_idx" ON "web_request_errors" USING btree ("occurred_at");