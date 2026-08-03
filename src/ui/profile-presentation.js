export function profileHeading(profile) { return profile?.displayName?.trim() || 'ROUTINE'; }
export function profileLocationLabel(profile) { return profile ? [profile.city, profile.state || profile.country].filter(Boolean).join(', ') : ''; }
