import '@tanstack/react-table';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Numeric columns render right-aligned. */
    align?: 'right';
    /** Hover explanation for the column header. */
    title?: string;
  }
}
