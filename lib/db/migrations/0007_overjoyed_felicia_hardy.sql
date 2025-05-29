DO $$ BEGIN
    ALTER TABLE "Chat" ADD COLUMN "difyConversationId" text;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;