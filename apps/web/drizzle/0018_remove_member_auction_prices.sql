ALTER TABLE "guild_members" DROP CONSTRAINT "guild_members_auction_seed_price_positive";--> statement-breakpoint
ALTER TABLE "guild_members" DROP CONSTRAINT "guild_members_auction_override_price_positive";--> statement-breakpoint
ALTER TABLE "guild_members" DROP COLUMN "auction_seed_price";--> statement-breakpoint
ALTER TABLE "guild_members" DROP COLUMN "auction_override_price";