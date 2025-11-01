import React, { useState, useEffect } from 'react';
import { Task } from '../pages/TasksPage';
import Spinner from './Spinner';

interface TaskModalProps {
  task: Task | null;
  onClose: () => void;
  onSave: (task: Omit<Task, 'id'>) => void;
  isLoading?: boolean;
}

const TaskModal: React.FC<TaskModalProps> = ({ task, onClose, onSave, isLoading }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reward, setReward] = useState(0);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setReward(task.reward);
      setStatus(task.status);
    } else {
      setTitle('');
      setDescription('');
      setReward(0);
      setStatus('active');
    }
  }, [task]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ title, description, reward, status });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-white">{task ? 'Edit Task' : 'Create Task'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
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
          <div className="mb-4">
            <label htmlFor="description" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline h-24"
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="reward" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Reward (Rs)</label>
            <input
              id="reward"
              type="number"
              step="0.01"
              value={reward}
              onChange={(e) => setReward(parseFloat(e.target.value))}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline"
              required
            />
          </div>
           <div className="mb-6">
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
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded mr-2"
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
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskModal;