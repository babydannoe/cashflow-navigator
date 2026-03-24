import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: callerProfile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (callerProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Alleen admins kunnen gebruikers uitnodigen" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const path = url.pathname;

    // Route: DELETE user
    if (req.method === "DELETE" || path.endsWith("/delete")) {
      const { user_id } = await req.json();
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is vereist" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("user_profiles").delete().eq("id", user_id);
      await supabase.auth.admin.deleteUser(user_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: UPDATE role
    if (path.endsWith("/update-role")) {
      const { user_id, role } = await req.json();
      if (!user_id || !["admin", "viewer"].includes(role)) {
        return new Response(JSON.stringify({ error: "user_id en geldige role zijn vereist" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase
        .from("user_profiles")
        .update({ role })
        .eq("id", user_id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: RESEND invite
    if (path.endsWith("/resend")) {
      const { email } = await req.json();
      if (!email) {
        return new Response(JSON.stringify({ error: "Email is vereist" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate a new invite link which sends an email
      const { data, error: linkError } = await supabase.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo: Deno.env.get("FRONTEND_URL") || "https://boost-flow-insight.lovable.app" },
      });

      if (linkError) {
        // If user already confirmed, try magic link instead
        const { data: magicData, error: magicError } = await supabase.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo: Deno.env.get("FRONTEND_URL") || "https://boost-flow-insight.lovable.app" },
        });

        if (magicError) {
          return new Response(JSON.stringify({ error: magicError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true, type: "magiclink", email }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, type: "invite", email }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: INVITE user (default POST)
    const { email, role = "viewer", full_name } = await req.json();
    if (!email || !["admin", "viewer"].includes(role)) {
      return new Response(JSON.stringify({ error: "Geldig e-mailadres en rol zijn vereist" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://boost-flow-insight.lovable.app";

    // Invite user via admin API
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: frontendUrl,
    });

    if (inviteError) {
      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pre-create user profile with specified role
    if (inviteData.user) {
      await supabase.from("user_profiles").upsert({
        id: inviteData.user.id,
        role,
        full_name: full_name || email.split("@")[0],
      }, { onConflict: "id" });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      user_id: inviteData.user?.id,
      email 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
