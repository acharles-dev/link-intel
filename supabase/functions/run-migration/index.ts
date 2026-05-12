Deno.serve(async () => {
  // Use the Supabase management API from within the Edge Function
  // Edge Functions have SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  
  if (!dbUrl) {
    // Fallback: use the REST API with service role to test if columns exist
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Try to read a column that may not exist
    const resp = await fetch(`${supabaseUrl}/rest/v1/competitors?select=tagline&limit=1`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
    });
    const text = await resp.text();
    
    return new Response(JSON.stringify({ 
      message: "Cannot run DDL from Edge Functions without DB_URL",
      column_check: text,
      env_keys: Object.keys(Deno.env.toObject()).filter(k => k.startsWith('SUPA')),
    }));
  }

  return new Response(JSON.stringify({ db_url: "found" }));
});
