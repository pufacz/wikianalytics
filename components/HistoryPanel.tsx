import React from 'react';
import { Clock, Download, Trash2, User } from 'lucide-react';

interface SavedProfile {
    id: string;
    username: string;
    lang: string;
    lastUpdated: string;
    rangeStart: string;
    rangeEnd: string;
}

interface HistoryPanelProps {
    profiles: SavedProfile[];
    currentProfileId: string | null;
    onLoad: (username: string, lang: string) => void;
    onDelete: (username: string, lang: string) => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ profiles, currentProfileId, onLoad, onDelete }) => {
    if (profiles.length === 0) return null;

    return (
        <div className="bg-slate-800/40 backdrop-blur border border-slate-700/50 rounded-2xl p-4 transition-all mb-6">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-300 px-1">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>Saved Profiles</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {profiles.map(profile => {
                    const isSelected = profile.id === currentProfileId;
                    return (
                        <div
                            key={profile.id}
                            className={`
                group relative flex items-center justify-between p-3 rounded-xl border border-transparent transition-all
                ${isSelected
                                    ? 'bg-blue-600/20 border-blue-500/30'
                                    : 'bg-slate-900/40 border-slate-700/30 hover:bg-slate-800 hover:border-slate-600'
                                }
              `}
                        >
                            <div
                                onClick={() => onLoad(profile.username, profile.lang)}
                                className="flex-grow min-w-0 cursor-pointer"
                            >
                                <div className="flex items-center gap-2">
                                    <User className={`w-3.5 h-3.5 ${isSelected ? 'text-blue-300' : 'text-slate-500'}`} />
                                    <span className={`text-sm font-medium truncate ${isSelected ? 'text-blue-100' : 'text-slate-300'}`}>
                                        {profile.username}
                                    </span>
                                    <span className="text-[10px] uppercase bg-slate-800 px-1.5 py-px rounded text-slate-500 border border-slate-700">
                                        {profile.lang}
                                    </span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1 pl-5.5 truncate">
                                    Updated: {new Date(profile.lastUpdated).toLocaleDateString()}
                                </div>
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(profile.username, profile.lang);
                                    }}
                                    className="p-1.5 hover:bg-rose-500/20 text-slate-600 hover:text-rose-400 rounded-lg transition-colors"
                                    title="Delete Profile"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
