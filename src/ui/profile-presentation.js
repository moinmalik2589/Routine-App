export function profileHeading(profile) { return profile?.displayName?.trim() || 'MOIN MALIK'; }
export function profileLocationLabel(profile) { return profile ? [profile.city, profile.state || profile.country].filter(Boolean).join(', ') : ''; }
