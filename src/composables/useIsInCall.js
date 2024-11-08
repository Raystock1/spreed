/**
 * SPDX-FileCopyrightText: 2020 Nextcloud GmbH and Nextcloud contributors
 * SPDX-FileCopyrightText: 2023 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createSharedComposable } from '@vueuse/core'
import { computed, onBeforeMount, onBeforeUnmount, ref } from 'vue'

import { useStore } from './useStore.js'
import { EventBus } from '../services/EventBus.js'
import SessionStorage from '../services/SessionStorage.js'

/**
 * Check whether the user joined the call of the current token in this PHP session or not
 *
 * @return {import('vue').ComputedRef<boolean>}
 */
function useIsInCallComposable() {
	const store = useStore()

	const sessionStorageJoinedConversation = ref(null)

	const readSessionStorageJoinedConversation = () => {
		sessionStorageJoinedConversation.value = SessionStorage.getItem('joined_conversation')
	}

	onBeforeMount(() => {
		EventBus.on('joined-conversation', readSessionStorageJoinedConversation)
		readSessionStorageJoinedConversation()
	})

	onBeforeUnmount(() => {
		EventBus.off('joined-conversation', readSessionStorageJoinedConversation)
	})

	return computed(() => {
		if (store.getters.forceCallView) {
			return true
		}
		return sessionStorageJoinedConversation.value === store.getters.getToken() && store.getters.isInCall(store.getters.getToken())
	})
}

/**
 * Shared composable to check whether the user joined the call of the current token in this PHP session or not
 * @return {import('vue').ComputedRef<boolean>}
 */
export const useIsInCall = createSharedComposable(useIsInCallComposable)
