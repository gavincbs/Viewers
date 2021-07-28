import React, { Component } from 'react';
import OHIF from '@ohif/core';
import PropTypes from 'prop-types';
import qs from 'querystring';

import { extensionManager } from './../App.js';
import ConnectedViewer from '../connectedComponents/ConnectedViewer';
import ConnectedViewerRetrieveStudyData from '../connectedComponents/ConnectedViewerRetrieveStudyData';
import NotFound from '../routes/NotFound';

import DICOMFileLoader from '../lib/localFileLoaders/dicomFileLoader';

const { log, metadata, utils } = OHIF;
const { studyMetadataManager } = utils;
const { OHIFStudyMetadata } = metadata;

class StandaloneRouting extends Component {
	state = {
		studies: null,
		server: null,
		studyInstanceUIDs: null,
		seriesInstanceUIDs: null,
		error: null,
		loading: true,
	};

	static propTypes = {
		location: PropTypes.object,
		store: PropTypes.object,
		setServers: PropTypes.func,
	};


	parseQueryAndRetrieveDICOMWebData(query) {
		return new Promise((resolve, reject) => {
			const url = query.url;

			if (!url) {
				return reject(new Error('No URL was specified. Use ?url=$yourURL'));
			}


			let imageId = "dicomweb:"+url;

			let result = cornerstone.loadAndCacheImage(imageId);


			result.then(async function(val) {
				debugger;

				const dataset = DICOMFileLoader.getDataset(val.data.byteArray.buffer, imageId);
				const studies = DICOMFileLoader.getStudies(dataset, imageId);

				if (!studies) {
					return;
				}

				const studyArray = [studies];

				// Parse data here and add to metadata provider.
				const metadataProvider = OHIF.cornerstone.metadataProvider;
				let StudyInstanceUID;
				let SeriesInstanceUID;

				debugger;
				studyArray.forEach(study => {
					StudyInstanceUID = study.StudyInstanceUID;

					study.series.forEach(series => {
						SeriesInstanceUID = series.SeriesInstanceUID;

						series.instances.forEach(instance => {
							const { url: imageId, metadata: naturalizedDicom } = instance;

							// Add instance to metadata provider.
							metadataProvider.addInstance(naturalizedDicom);
							// Add imageId specific mapping to this data as the URL isn't necessarliy WADO-URI.
							metadataProvider.addImageIdToUIDs(imageId, {
								StudyInstanceUID,
								SeriesInstanceUID,
								SOPInstanceUID: naturalizedDicom.SOPInstanceUID,
							});
						});
					});
				});

				resolve({ studies: studyArray, studyInstanceUIDs: [] });
			});

		});
	}

	async componentDidMount() {
		try {
			let { search } = this.props.location;

			// Remove ? prefix which is included for some reason
			search = search.slice(1, search.length);
			const query = qs.parse(search);

			let {
				server,
				studies,
				studyInstanceUIDs,
				seriesInstanceUIDs,
			} = await this.parseQueryAndRetrieveDICOMWebData(query);

			if (studies) {
				const {
					studies: updatedStudies,
					studyInstanceUIDs: updatedStudiesInstanceUIDs,
				} = _mapStudiesToNewFormat(studies);
				studies = updatedStudies;
				studyInstanceUIDs = updatedStudiesInstanceUIDs;
			}

			this.setState({
				studies,
				server,
				studyInstanceUIDs,
				seriesInstanceUIDs,
				loading: false,
			});
		} catch (error) {
			this.setState({ error: error.message, loading: false });
		}
	}

	render() {
		const message = this.state.error
			? `Error: ${JSON.stringify(this.state.error)}`
			: 'Loading...';
		if (this.state.error || this.state.loading) {
			return <NotFound message={message} showGoBackButton={this.state.error} />;
		}

		return this.state.studies ? (
			<ConnectedViewer studies={this.state.studies} />
		) : (
				<ConnectedViewerRetrieveStudyData
					studyInstanceUIDs={this.state.studyInstanceUIDs}
					seriesInstanceUIDs={this.state.seriesInstanceUIDs}
					server={this.state.server}
				/>
			);
	}
}

const _mapStudiesToNewFormat = studies => {
	studyMetadataManager.purge();

	/* Map studies to new format, update metadata manager? */
	const uniqueStudyUIDs = new Set();
	const updatedStudies = studies.map(study => {
		const studyMetadata = new OHIFStudyMetadata(study, study.StudyInstanceUID);

		const sopClassHandlerModules =
			extensionManager.modules['sopClassHandlerModule'];
		study.displaySets =
			study.displaySets ||
			studyMetadata.createDisplaySets(sopClassHandlerModules);

		studyMetadataManager.add(studyMetadata);
		uniqueStudyUIDs.add(study.StudyInstanceUID);

		return study;
	});

	return {
		studies: updatedStudies,
		studyInstanceUIDs: Array.from(uniqueStudyUIDs),
	};
};

export default StandaloneRouting;
