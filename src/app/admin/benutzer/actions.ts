'use server'

import { revalidatePath } from 'next/cache'
import { erzeugeStartpasswort } from '@/lib/benutzer'
import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/tenant'

export type AdminBenutzerErgebnis =
  | { ok: true; meldung: string; startpasswort?: string; email?: string }
  | { ok: false; meldung: string }

/** Plattformrolle vergeben oder entziehen. */
export async function setzeAdminrolle(
  userId: string, istAdmin: boolean,
): Promise<AdminBenutzerErgebnis> {
  if (!(await isPlatformAdmin())) {
    return { ok: false, meldung: 'Nur ein Admin kann Plattformrechte vergeben.' }
  }

  const supabase = await createClient()
  const { data: { user: ich } } = await supabase.auth.getUser()

  // Sich selbst die Adminrechte zu entziehen sperrt einen aus dem Adminportal
  // aus -- und wenn es der letzte Admin war, kommt niemand mehr hinein.
  if (!istAdmin && ich?.id === userId) {
    return { ok: false, meldung: 'Du kannst dir die Adminrechte nicht selbst entziehen.' }
  }

  const admin = adminClient()

  if (istAdmin) {
    const { error } = await admin.from('platform_admins')
      .insert({ user_id: userId, note: 'Über das Adminportal' })
    if (error && !error.message.includes('duplicate')) {
      return { ok: false, meldung: 'Die Rolle konnte nicht vergeben werden.' }
    }
  } else {
    const { count } = await admin
      .from('platform_admins').select('user_id', { count: 'exact', head: true })
    if ((count ?? 0) <= 1) {
      return { ok: false, meldung: 'Das ist der letzte Admin. Erst einen zweiten anlegen.' }
    }
    await admin.from('platform_admins').delete().eq('user_id', userId)
  }

  await supabase.rpc('log_audit', {
    p_tenant_id: null, p_action: istAdmin ? 'admin.granted' : 'admin.revoked',
    p_target_type: 'user', p_target_id: userId, p_meta: {},
  })

  revalidatePath('/admin/benutzer')
  return { ok: true, meldung: istAdmin ? 'Adminrechte vergeben.' : 'Adminrechte entzogen.' }
}

/** Startpasswort neu setzen -- mandantenübergreifend, für jeden Benutzer. */
export async function setzePasswortNeu(userId: string): Promise<AdminBenutzerErgebnis> {
  if (!(await isPlatformAdmin())) {
    return { ok: false, meldung: 'Nur ein Admin kann das.' }
  }

  const startpasswort = erzeugeStartpasswort()
  const { data, error } = await adminClient().auth.admin.updateUserById(userId, {
    password: startpasswort,
    app_metadata: { muss_passwort_aendern: true },
  })
  if (error || !data?.user) {
    return { ok: false, meldung: 'Das Passwort konnte nicht zurückgesetzt werden.' }
  }

  revalidatePath('/admin/benutzer')
  return {
    ok: true, meldung: 'Neues Startpasswort gesetzt.',
    email: data.user.email ?? '', startpasswort,
  }
}

/** Konto vollständig löschen -- inklusive aller Mitgliedschaften. */
export async function loescheBenutzer(userId: string): Promise<AdminBenutzerErgebnis> {
  if (!(await isPlatformAdmin())) {
    return { ok: false, meldung: 'Nur ein Admin kann das.' }
  }

  const supabase = await createClient()
  const { data: { user: ich } } = await supabase.auth.getUser()
  if (ich?.id === userId) {
    return { ok: false, meldung: 'Du kannst dein eigenes Konto nicht löschen.' }
  }

  const { error } = await adminClient().auth.admin.deleteUser(userId)
  if (error) {
    console.error('[admin] Benutzer löschen', error.message)
    return { ok: false, meldung: 'Das Konto konnte nicht gelöscht werden.' }
  }

  revalidatePath('/admin/benutzer')
  return { ok: true, meldung: 'Konto gelöscht.' }
}

/** Rechte einer Mitgliedschaft ändern. */
export async function setzeRechte(
  tenantId: string, userId: string,
  darfBenutzerVerwalten: boolean, erlaubteTypen: string[] | null,
): Promise<AdminBenutzerErgebnis> {
  const supabase = await createClient()

  const { data: darf } = await supabase.rpc('can_manage_tenant', { p_tenant_id: tenantId })
  if (darf !== true) return { ok: false, meldung: 'Dafür fehlt dir die Berechtigung.' }

  const { error } = await supabase
    .from('tenant_members')
    .update({
      can_manage_users: darfBenutzerVerwalten,
      allowed_content_types: erlaubteTypen,
    })
    .eq('tenant_id', tenantId).eq('user_id', userId)

  if (error) {
    console.error('[admin] Rechte setzen', error.message)
    return { ok: false, meldung: 'Die Rechte konnten nicht gespeichert werden.' }
  }

  await supabase.rpc('log_audit', {
    p_tenant_id: tenantId, p_action: 'member.permissions_changed',
    p_target_type: 'user', p_target_id: userId,
    p_meta: { verwaltet: darfBenutzerVerwalten, typen: erlaubteTypen?.length ?? 'alle' },
  })

  revalidatePath('/admin/benutzer')
  revalidatePath(`/t/${tenantId}/benutzer`)
  return { ok: true, meldung: 'Rechte gespeichert.' }
}
