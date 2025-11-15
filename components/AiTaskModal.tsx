import React, { useState } from 'react';
import { generateTaskWithAi } from '../services/aiService';
import { useToast } from '../contexts/ToastContext';
import { Task } from '../pages/TasksPage';
import Spinner from './Spinner';
import { SparklesIcon } from './icons/SparklesIcon';

interface AiTaskModalProps {
  onClose: () => void;
  onSave: (task: Omit<Task, 'id'>) => void;
}

type GeneratedTask = Omit<Task, 'id' | 'status'>;

const AiTaskModal: React.FC<AiTaskModalProps> = ({ onClose, onSave }) => {
  const [prompt, setPrompt] = useState('');
  const [step, setStep] = useState<'prompt' | 'review'>('prompt');
  const [isLoading, setIsLoading] = useState(false);
  const [generatedTask, setGeneratedTask] = useState<GeneratedTask | null>(null);
  const { addToast } = useToast();

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      addToast('Please enter a description for the task you want to create.', 'warning');
      return;
    }
    setIsLoading(true);
    try {
      const result = await generateTaskWithAi(prompt);
      setGeneratedTask(result);
      setStep('review');
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      addToast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = () => {
    if (generatedTask) {
      onSave({ ...generatedTask, status: 'active' });
    }
  };

  const handleGeneratedTaskChange = (field: keyof GeneratedTask, value: string | number) => {
    if (generatedTask) {
      setGeneratedTask({ ...generatedTask, [field]: value });
    }
  };

  const renderPromptStep = () => (
    <>
      <div className="mb-4">
        <label htmlFor="ai-prompt" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
          Describe the task
        </label>
        <textarea
          id="ai-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline h-28"
          placeholder="e.g., 'Create a task for users to subscribe to a YouTube channel and like the latest video.'"
          required
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded" disabled={isLoading}>
          Cancel
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded inline-flex items-center disabled:bg-purple-400"
          disabled={isLoading}
        >
          {isLoading ? <Spinner /> : <SparklesIcon className="w-5 h-5 -ml-1 mr-2" />}
          {isLoading ? 'Generating...' : 'Generate Task'}
        </button>
      </div>
    </>
  );

  const renderReviewStep = () => (
    <>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">AI has generated the following task. You can review and edit it before saving.</p>
      <div className="mb-4">
        <label htmlFor="title" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Title</label>
        <input id="title" type="text" value={generatedTask?.title || ''} onChange={(e) => handleGeneratedTaskChange('title', e.target.value)} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600" />
      </div>
      <div className="mb-4">
        <label htmlFor="description" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Description</label>
        <textarea id="description" value={generatedTask?.description || ''} onChange={(e) => handleGeneratedTaskChange('description', e.target.value)} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 h-32" />
      </div>
      <div className="mb-6">
        <label htmlFor="reward" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Reward (Rs)</label>
        <input id="reward" type="number" step="0.01" value={generatedTask?.reward || 0} onChange={(e) => handleGeneratedTaskChange('reward', parseFloat(e.target.value))} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600" />
      </div>
      <div className="flex items-center justify-end gap-2">
         <button type="button" onClick={() => setStep('prompt')} className="text-gray-600 dark:text-gray-300 font-bold py-2 px-4 rounded" disabled={isLoading}>
          Back
        </button>
        <button type="button" onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded">
          Save Task
        </button>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg">
        <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-white flex items-center gap-2">
            <SparklesIcon className="w-6 h-6 text-purple-500" />
            Create Task with AI
        </h2>
        {step === 'prompt' ? renderPromptStep() : renderReviewStep()}
      </div>
    </div>
  );
};

export default AiTaskModal;
