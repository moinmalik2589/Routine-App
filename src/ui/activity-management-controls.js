export function activityManagementControls(activity, index, total) {
  if (activity.protected) {
    const notificationOn = activity.timeSlots.some(({ notificationEnabled }) => notificationEnabled);
    return `<button data-manage="toggle" data-id="${activity.id}">${activity.enabled ? 'Disable' : 'Enable'}</button><button data-manage="notification" data-id="${activity.id}">Notification ${notificationOn ? 'On' : 'Off'}</button>`;
  }
  return `<button data-manage="up" data-id="${activity.id}" ${index === 0 ? 'disabled' : ''}>↑</button><button data-manage="down" data-id="${activity.id}" ${index === total - 1 ? 'disabled' : ''}>↓</button><button data-manage="edit" data-id="${activity.id}">Edit</button><button data-manage="toggle" data-id="${activity.id}">${activity.enabled ? 'Disable' : 'Enable'}</button><button class="danger" data-manage="remove" data-id="${activity.id}">Remove</button>`;
}
