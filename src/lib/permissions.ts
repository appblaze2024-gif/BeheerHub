
export const permissionConfig = [
    { 
        module: 'projects', 
        label: 'Projecten', 
        actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }],
        tabs: [
            { id: 'project', label: 'Project' },
            { id: 'annual-planning', label: 'Jaarplanning' },
            { id: 'bestanden', label: 'Documenten' },
            { id: 'werksoorten', label: 'Werksoorten' },
            { id: 'boekingregels', label: 'Boekingregels' },
            { id: 'afspraken', label: 'Afspraken' },
            { id: 'organisatie', label: 'Organisatie' },
            { id: 'wijken', label: 'Wijken' },
            { id: 'veegroutes', label: 'Veegroutes' },
            { id: 'prullenbakkenroutes', label: 'Prullenbakkenroutes' },
        ]
    },
    { 
        module: 'employees', 
        label: 'Medewerkers', 
        actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }],
        tabs: [
            { id: 'overzicht', label: 'Overzicht' },
            { id: 'afwezigheid', label: 'Afwezigheid' },
            { id: 'rooster', label: 'Rooster' },
            { id: 'contracten', label: 'Contracten' },
        ]
    },
    { module: 'workPlanning', label: 'Werkplanning', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'edit', label: 'Bewerken' }] },
    { module: 'weeklyReports', label: 'Weekstaten', actions: [{ id: 'view', label: 'Bekijken' }] },
    { module: 'reports', label: 'Rapportages', actions: [{ id: 'view', label: 'Bekijken' }] },
    { module: 'minutes', label: 'Notulen', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }] },
    { module: 'bestanden', label: 'Bestanden', actions: [{ id: 'view', label: 'Bekijken' }] },
    { 
        module: 'vehicles', 
        label: 'Wagenpark', 
        actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }],
        tabs: [
            { id: 'actions', label: 'Acties' },
            { id: 'maintenance', label: 'Onderhoud' },
            { id: 'damages', label: 'Schade' },
            { id: 'documents', label: 'Documenten' },
        ]
    },
    { 
        module: 'objects', 
        label: 'Objecten', 
        actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }],
        tabs: [
            { id: 'overzicht', label: 'Overzicht' },
            { id: 'import', label: 'Import' },
            { id: 'export', label: 'Export' },
        ]
    },
    { module: 'excelSync', label: 'Excel Sync Hub', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'edit', label: 'Bewerken' }, { id: 'use', label: 'Synchroniseren' }] },
    { module: 'gisData', label: 'GIS-data', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'edit', label: 'Bewerken' }] },
    { module: 'inventory', label: 'Voorraadbeheer', actions: [{ id: 'view', label: 'Bekijken' }] },
    { 
        module: 'issues', 
        label: 'Meldingen', 
        actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }],
        tabs: [
            { id: 'werkbonnen', label: 'Werkbonnen' },
            { id: 'open', label: 'Openstaande meldingen' },
            { id: 'new', label: 'Melding maken' },
            { id: 'archive', label: 'Meldingen archief' },
            { id: 'portal', label: 'Meldingenportaal' },
        ]
    },
    { module: 'specReports', label: 'Besteksmeldingen', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }] },
    { 
        module: 'navigation', 
        label: 'Navigatiemodule', 
        actions: [{ id: 'use', label: 'Gebruiken' }],
        tabs: [
            { id: 'veegroutes', label: 'Veegroutes' },
            { id: 'prullenbakken', label: 'Prullenbakken' },
            { id: 'history', label: 'Historie' },
            { id: 'assignment', label: 'Toewijzen' },
        ]
    },
    { module: 'iot', label: 'Internet of Things Integratie', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'use', label: 'Gebruiken' }] },
    { module: 'apiIntegrations', label: 'API Koppelingen', actions: [{ id: 'view', label: 'Bekijken' }, { id: 'edit', label: 'Bewerken' }] },
    { module: 'mail', label: 'Mail', actions: [{ id: 'use', label: 'Gebruiken' }] },
    { 
        module: 'users', 
        label: 'Gebruikersbeheer', 
        actions: [{ id: 'view', label: 'Bekijken' }, { id: 'create', label: 'Aanmaken' }, { id: 'edit', label: 'Bewerken' }, { id: 'delete', label: 'Verwijderen' }],
        tabs: [
            { id: 'profile', label: 'Mijn Profiel' },
            { id: 'users', label: 'Gebruikers' },
        ]
    },
    { module: 'news', label: 'Nieuws berichten', actions: [{ id: 'view', label: 'Bekijken' }] },
];

export const getDefaultPermissions = () => {
    const defaultPermissions: { [key: string]: any } = {};
      permissionConfig.forEach(mod => {
        defaultPermissions[mod.module] = {};
        mod.actions.forEach(perm => {
          defaultPermissions[mod.module][perm.id] = false;
        });
        if (mod.tabs) {
            const tabPermissions: { [key: string]: boolean } = {};
            mod.tabs.forEach(tab => {
                tabPermissions[tab.id] = true;
            });
            defaultPermissions[mod.module].tabs = tabPermissions;
        }
      });
    return defaultPermissions;
}
