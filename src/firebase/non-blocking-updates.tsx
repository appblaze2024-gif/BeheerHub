'use client';
    
import {
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  CollectionReference,
  DocumentReference,
  SetOptions,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import {FirestorePermissionError} from '@/firebase/errors';

/**
 * Initiates a setDoc operation for a document reference.
 * Returns the promise from the underlying Firestore SDK call.
 */
export async function setDocumentNonBlocking(docRef: DocumentReference, data: any, options: SetOptions) {
  try {
    await setDoc(docRef, data, options);
  } catch (error) {
    errorEmitter.emit(
      'permission-error',
      new FirestorePermissionError({
        path: docRef.path,
        operation: options && 'merge' in options ? 'update' : 'create',
        requestResourceData: data,
      })
    );
    throw error;
  }
}


/**
 * Initiates an addDoc operation for a collection reference.
 * Returns the promise from the underlying Firestore SDK call.
 */
export async function addDocumentNonBlocking(colRef: CollectionReference, data: any) {
  try {
    return await addDoc(colRef, data);
  } catch (error) {
    errorEmitter.emit(
      'permission-error',
      new FirestorePermissionError({
        path: colRef.path,
        operation: 'create',
        requestResourceData: data,
      })
    );
    throw error;
  }
}


/**
 * Initiates an updateDoc operation for a document reference.
 * Returns the promise from the underlying Firestore SDK call.
 */
export async function updateDocumentNonBlocking(docRef: DocumentReference, data: any) {
  try {
    await updateDoc(docRef, data);
  } catch (error) {
    errorEmitter.emit(
      'permission-error',
      new FirestorePermissionError({
        path: docRef.path,
        operation: 'update',
        requestResourceData: data,
      })
    );
    throw error;
  }
}


/**
 * Initiates a deleteDoc operation for a document reference.
 * Returns the promise from the underlying Firestore SDK call.
 */
export async function deleteDocumentNonBlocking(docRef: DocumentReference): Promise<void> {
  try {
    await deleteDoc(docRef);
  } catch (error) {
    errorEmitter.emit(
      'permission-error',
      new FirestorePermissionError({
        path: docRef.path,
        operation: 'delete',
      })
    );
    // Re-throw the error if you want the caller to be able to handle it further
    throw error;
  }
}
