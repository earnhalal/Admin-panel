import React, { useState, useEffect } from 'react';
import { Task, TaskType } from '../pages/TasksPage';
import Spinner from './Spinner';
import { YouTubeIcon } from './icons/YouTubeIcon';
import { InstagramIcon } from './icons/InstagramIcon';
import { FacebookIcon } from './icons/FacebookIcon';
import { GlobeIcon } from './icons/GlobeIcon';
import { LinkIcon } from './icons/LinkIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';


interface TaskModalProps {
  task: Task | null;
  onClose: () => void;
  onSave: (task: Omit<Task, 'id'>) => void;
  isLoading?: boolean;
}

const taskTypeOptions: { id: TaskType; name: string; icon: React.ReactNode; placeholder: string }[] = [
    { id: 'youtube', name: 'YouTube', icon: <YouTubeIcon className="w-5 h-5 text-red-500" />, placeholder: 'https://www.youtube.com/watch?v=...' },
    { id: 'instagram', name: 'Instagram', icon: <InstagramIcon className="w-5 h-5 text-pink-500" />, placeholder: 'https://www.instagram.com/p/...' },
    { id: 'facebook', name: 'Facebook', icon: <FacebookIcon className="w-5 h-5 text-blue-600" />, placeholder: 'https://www.facebook.com/...' },
    { id: 'website', name: 'Website', icon: <GlobeIcon className="w-5 h-5" />, placeholder: 'https://example.com' },
    { id: 'other', name: 'Other', icon: <LinkIcon className="w-5 h-5" />, placeholder: 'https://...' },
];


const TaskModal: React.FC<TaskModalProps> = ({ task, onClose, onSave, isLoading }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reward, setReward] = useState(0);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [taskType, setTaskType] = useState<TaskType | null>(null);
  const [taskUrl, setTaskUrl] = useState('');
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setReward(task.reward);
      setStatus(task.status as 'active' | 'inactive');
      setTaskType(task.taskType || null);
      setTaskUrl(task.taskUrl || '');
    } else {
      setTitle('');
      setDescription('');
      setReward(0);
      setStatus('active');
      setTaskType(null);
      setTaskUrl('');
    }
  }, [task]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ title, description, reward, status, taskType: taskType ?? undefined, taskUrl: taskUrl || undefined });
  };
  
  const selectedType = taskType ? taskTypeOptions.find(t => t.id === taskType) : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg">
        <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-white">{task ? 'Edit Task' : 'Create Task'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Title</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline"
              required
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline h-24"
              required
            />
          </div>

           <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Task Link (Optional)</label>
                <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative sm:w-1/3">
                        <button type="button" onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)} className="w-full flex items-center justify-between shadow-sm border rounded py-2 px-3 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600">
                            <span className="flex items-center gap-2">
                                {selectedType ? selectedType.icon : <LinkIcon className="w-5 h-5 text-gray-400"/>}
                                <span className="text-gray-700 dark:text-gray-200">{selectedType ? selectedType.name : 'Select Type'}</span>
                            </span>
                             <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform ${isTypeDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isTypeDropdownOpen && (
                            <div className="absolute top-full left-0 mt-1 w-full bg-white dark:bg-gray-700 rounded-md shadow-lg border border-gray-200 dark:border-gray-600 z-10">
                                {taskTypeOptions.map(opt => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => { setTaskType(opt.id); setIsTypeDropdownOpen(false); }}
                                        className="w-full text-left flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-600"
                                    >
                                        {opt.icon}
                                        <span className="text-gray-800 dark:text-gray-200">{opt.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex-grow">
                        <input
                            type="url"
                            value={taskUrl}
                            onChange={(e) => setTaskUrl(e.target.value)}
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            placeholder={selectedType ? selectedType.placeholder : 'Enter URL...'}
                        />
                    </div>
                </div>
            </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="reward" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Reward (Rs)</label>
              <input
                id="reward"
                type="number"
                step="0.01"
                value={reward}
                onChange={(e) => setReward(parseFloat(e.target.value) || 0)}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline"
                required
              />
            </div>
             <div>
              <label htmlFor="status" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Status</label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded inline-flex items-center disabled:bg-indigo-400"
              disabled={isLoading}
            >
              {isLoading && <Spinner />}
              {task ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskModal;
