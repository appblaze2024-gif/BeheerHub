export const permissionConfig = [
    { module: 'projects', label: 'Projecten', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }] },
    { module: 'employees', label: 'Medewerkers', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }] },
    { module: 'workPlanning', label: 'Werkplanning', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'edit', label: 'Bewerken' }] },
    { module: 'weeklyReports', label: 'Weekstaten', actions: [{ id: 'view', label: 'Bekijken' }] },
    { module: 'reports', label: 'Rapportages', actions: [{ id: 'view', label: 'Bekijken' }] },
    { module: 'vehicles', label: 'Wagenpark', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }] },
    { module: 'objects', label: 'Objecten', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }] },
    { module: 'inventory', label: 'Voorraadbeheer', actions: [{ id: 'view', label: 'Bekijken' }] },
    { module: 'issues', label: 'Meldingen', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }] },
    { module: 'navigation', label: 'Navigatiemodule', actions: [{ id: 'use', label: 'Gebruiken' }] },
    { module: 'mail', label: 'Mail', actions: [{ id: 'use', label: 'Gebruiken' }] },
    { module: 'users', label: 'Gebruikersbeheer', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }] },
];

export const getDefaultPermissions = () => {
    const defaultPermissions: { [key: string]: { [key: string]: boolean } } = {};
      permissionConfig.forEach(mod => {
        defaultPermissions[mod.module] = {};
        mod.actions.forEach(perm => {
          defaultPermissions[mod.module][perm.id] = false;
        });
      });
    return defaultPermissions;
}
