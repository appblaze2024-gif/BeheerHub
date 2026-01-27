'use client';

import * as React from 'react';
import {
  Folder,
  Plus,
  Copy,
  Move,
  Archive,
  MoreVertical,
  Trash2,
  Search,
  ChevronRight,
  ArrowUp,
  FileCode,
  FileImage,
  FolderOpen,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';

const files = [
  { type: 'dir', name: '..', modified: 'April 28, 2021 11:07 AM', size: '', permissions: 'rwx--x--', user: 'sysuser_d', group: 'psaserv' },
  { type: 'folder', name: 'css', modified: 'April 28, 2021 11:19 AM', size: '', permissions: 'rwxr-xr-x', user: 'sysuser_d', group: 'psacln' },
  { type: 'folder', name: 'img', modified: 'April 28, 2021 11:19 AM', size: '', permissions: 'rwxr-xr-x', user: 'sysuser_d', group: 'psacln' },
  { type: 'folder', name: 'test', modified: 'April 28, 2021 11:19 AM', size: '', permissions: 'rwxr-xr-x', user: 'sysuser_d', group: 'psacln' },
  { type: 'file', name: 'index.html', modified: 'April 28, 2021 11:07 AM', size: '4.0 KB', permissions: 'rw-r--r--', user: 'sysuser_d', group: 'psacln' },
];

export default function BestandenPage() {
    
  return (
    <div className="p-6 flex-1 flex flex-col md:flex-row gap-6 min-h-0">
        <div className="w-full md:w-64 bg-card p-4 rounded-lg border">
            <h2 className="font-semibold mb-4">Home directory</h2>
             <ul className="space-y-2 text-sm">
                <li><button className="flex items-center gap-2 w-full text-left"><ChevronRight size={16} /> <Folder size={16} className="text-yellow-500"/> error_docs</button></li>
                <li className="bg-blue-100 dark:bg-blue-900/50 rounded-md -ml-2 pl-2"><button className="flex items-center gap-2 w-full text-left font-semibold"><ChevronRight size={16} /> <FolderOpen size={16} className="text-yellow-500"/> httpdocs</button></li>
                <li><button className="flex items-center gap-2 w-full text-left"><ChevronRight size={16} /> <Folder size={16} className="text-yellow-500"/> logs</button></li>
             </ul>
        </div>
        
        <div className="flex-1 bg-card rounded-lg border flex flex-col">
            <div className="p-3 border-b flex flex-wrap gap-2 justify-between items-center">
                <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline"><Plus className="mr-2 h-4 w-4" /> Toevoegen</Button>
                    <Button variant="outline">Kopiëren</Button>
                    <Button variant="outline">Verplaatsen</Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="outline">Archiveren <ChevronDown className="ml-2 h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem>Toevoegen aan archief</DropdownMenuItem>
                            <DropdownMenuItem>Archief uitpakken</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="outline">Meer <ChevronDown className="ml-2 h-4 w-4" /></Button></DropdownMenuTrigger>
                         <DropdownMenuContent>
                            <DropdownMenuItem>Rechten wijzigen</DropdownMenuItem>
                         </DropdownMenuContent>
                    </DropdownMenu>
                    <Button variant="destructive">Verwijderen</Button>
                </div>
                 <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Bestandsnaam zoeken" className="pl-9" />
                </div>
            </div>

            <div className="p-3 text-sm text-muted-foreground">
                <span>Home directory</span> &gt; <span>httpdocs</span>
            </div>

            <div className="flex-1 overflow-auto">
                <Table>
                    <TableHeader className="sticky top-0 bg-card">
                        <TableRow>
                            <TableHead className="w-[50px]"><Checkbox /></TableHead>
                            <TableHead>Naam</TableHead>
                            <TableHead>Gewijzigd</TableHead>
                            <TableHead>Grootte</TableHead>
                            <TableHead>Rechten</TableHead>
                            <TableHead>Gebruiker</TableHead>
                            <TableHead>Groep</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {files.map(file => (
                            <TableRow key={file.name}>
                                <TableCell><Checkbox /></TableCell>
                                <TableCell className="flex items-center gap-2 font-medium">
                                    {file.type === 'dir' && <ArrowUp className="h-5 w-5 text-blue-500" />}
                                    {file.type === 'folder' && <Folder className="h-5 w-5 text-yellow-500" />}
                                    {file.type === 'file' && <FileCode className="h-5 w-5 text-gray-500" />}
                                    <span>{file.name}</span>
                                </TableCell>
                                <TableCell>{file.modified}</TableCell>
                                <TableCell>{file.size}</TableCell>
                                <TableCell className="font-mono text-xs">{file.permissions}</TableCell>
                                <TableCell>{file.user}</TableCell>
                                <TableCell>{file.group}</TableCell>
                                <TableCell>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem>Bewerken</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    </div>
  );
}
