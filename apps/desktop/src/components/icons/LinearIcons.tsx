import React from 'react';

// Priorities
export const LinearUrgent = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
     <path d="M2.5 1.5H11.5C12.0523 1.5 12.5 1.94772 12.5 2.5V11.5C12.5 12.0523 12.0523 12.5 11.5 12.5H2.5C1.94772 12.5 1.5 12.0523 1.5 11.5V2.5C1.5 1.94772 1.94772 1.5 2.5 1.5Z" stroke="#f59e0b" strokeWidth="1.2" />
     <path d="M7 4V8" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
     <circle cx="7" cy="10" r="1" fill="#f59e0b" />
  </svg>
);

export const LinearHigh = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
     <path d="M4 10V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
     <path d="M7 10V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
     <path d="M10 10V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const LinearMedium = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
     <path d="M5 10V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
     <path d="M9 10V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const LinearLow = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
     <path d="M7 10V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const LinearNone = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
     <path d="M4 7H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// Statuses
export const LinearBacklog = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
     <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" />
  </svg>
);

export const LinearTodo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
     <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

export const LinearInProgress = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
     <circle cx="7" cy="7" r="5.5" stroke="#f59e0b" strokeWidth="1.2" />
     <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7H7V1.5Z" fill="#f59e0b" />
  </svg>
);

export const LinearReview = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
     <circle cx="7" cy="7" r="5.5" stroke="#8b5cf6" strokeWidth="1.2" />
     <circle cx="7" cy="7" r="2.5" fill="#8b5cf6" />
  </svg>
);

export const LinearDone = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
     <circle cx="7" cy="7" r="6" fill="#6366f1" />
     <path d="M4.5 7L6.5 9L10 5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const LinearCanceled = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
     <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
     <path d="M4.5 4.5L9.5 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
     <path d="M9.5 4.5L4.5 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);
