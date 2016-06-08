function getNextPage(linksHeader) {
  // from github.js Requestable.js
  var links = linksHeader.split(/\s*,\s*/); // splits and strips the urls
  
  return links.reduce(function(nextUrl, link) {
    if (link.search(/rel\s*=\s*"next"/) !== -1) {
      return (link.match(/<(.*)>/) || [])[1];
    }
    return nextUrl;
  }, undefined);
}


var PullRequest = React.createClass({
  displayName: 'PullRequest',
  render: function() {
    return (
      <div class="row">
      <div className="pull-request">
        <div>
        <span>#{this.props.data.number}</span>
        <span>{this.props.data.title}</span>
        </div>
        <div><a href="{this.props.data.html_url}">on GitHub</a></div>
        <div class="author">Author: @{this.props.data.user.login}</div>
        <div class="updated timestamp">Updated: {this.props.data.updated_at}</div>
        <div class="updated timestamp">Created: {this.props.data.created_at}</div>
      </div>
      </div>
    )
  },
});

var PullRequestList = React.createClass({
  displayName: 'PullRequestList',
  render: function() {
    var that = this;
    var prNodes = this.props.data.map(function (pr_data) {
      console.log(pr_data);
      return (
        <PullRequest key={pr_data.id} data={pr_data} github={github} />
      )
    });
    console.log('prs', prNodes.length);
    return (
      <div className="prList">
        {prNodes}
      </div>
    )
  }
});


var Repo = React.createClass({
  displayName: 'Repo',
  getInitialState: function() {
    return {
      pulls: [],
      css_classes: 'hidden',
    };
  },
  componentDidMount: function() {
    this.loadPulls();
  },
  render: function() {
    return (
      <div className="repo {this.state.css_classes}">
      <div>
      {this.props.data.full_name}
      </div>
      <PullRequestList github={this.props.github} data={this.state.pulls} />
      </div>
    )
  },
  loadPulls: function () {
    var that = this;
    this.props.github.getRepo(this.props.data.full_name).listPullRequests().then(function(resp) {
      console.log("load pulls", resp);
      that.setState({
        pulls: resp.data,
        css_classes: resp.data.length === 0 ? 'hidden' : '',
      })
    })
  }
});

var RepoList = React.createClass({
  displayName: 'RepoList',
  render: function() {
    var repoNodes = this.props.data.map(function (repo_data) {
      return (
        <Repo key={repo_data.full_name} data={repo_data} github={github} />
      )
    });
    return (
      <div className="repoList">
      {repoNodes}
      </div>
    )
  }
});

var User = React.createClass({
  displayName: 'User',
  getInitialState: function() {
    return {
      repos: [],
      profile: {},
    };
  },
  componentDidMount: function() {
    window.props = this.props;
    this.loadProfile();
    this.loadRepos();
  },
  render: function() {
    return (
      <div className="user">
        Showing all pull requests mergeable by
      <span className="username">
      @{this.state.profile.name}
      </span>
      <RepoList data={this.state.repos} github={github} />
      </div>
    )
  },
  loadProfile: function () {
    var that = this;
    this.props.user.getProfile().then(function (profile) {
      that.setState({
        name: profile.data.login
      });
    });
  },
  loadRepos: function() {
    var that = this;
    // use paged request to load data piecemeal
    // this is based on github.js _requestAllPages
    var user = this.props.user;
    function handleMoreRepos(resp) {
      if (resp.headers.link !== undefined) {
        var nextUrl = getNextPage(resp.headers.link);
        if (nextUrl) {
          user._request('GET', nextUrl).then(handleMoreRepos);
        }
      }
      that.setState({
        repos: that.state.repos.concat(resp.data)
      });
    }
    user._request('GET', '/user/repos', {sort: 'updated'}).then(handleMoreRepos);
  },
});

var code_match = window.location.href.match(/\?code=(.*)/);
if (!code_match) {
  window.location = "https://github.com/login/oauth/authorize?scope=read:org&client_id=19277e98ad9400d0133b&redirect_uri=" + window.location;
}
var code = code_match[1];
// scrub OAuth code
window.history.replaceState("not sure", "All My Pulls", window.location.pathname);

$.getJSON('https://minrk-github-oauth.herokuapp.com/authenticate/'+code, function(data) {
  console.log(data);
  var github = window.github = new GitHub({
    token: data.token
  });
  
  var user = github.getUser();
  ReactDOM.render(
    <User github={github} user={user} data={data} />,
    document.getElementById('content')
  );
});
